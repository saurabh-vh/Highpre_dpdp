"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearPending2fa, createPending2fa, createSession, destroySession, readPending2fa } from "@/lib/auth/session";
import { checkSecondFactor, recoveryCodesLeft } from "@/lib/auth/two-factor";
import { connectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/mailer";
import { passwordResetEmail, twoFactorChangedEmail } from "@/lib/mail/templates";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/crypto";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, twoFactorCodeSchema } from "@/lib/validation";
import { Organization, User } from "@/models";

// Compared against when the email doesn't exist, so response time doesn't reveal accounts.
const DUMMY_HASH = "$2b$12$vYYlEI135xa10.Ps32JyieY41bMLo1FXRp/r0kCs8CuQ0aqjir2Pi";

/** Only allow redirects to paths inside the app. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return /^\/(dashboard|invite\/)/.test(next) && !next.startsWith("//") ? next : "/dashboard";
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { name, company, email, password } = parsed.data;

  await connectDb();
  if (await User.exists({ email })) {
    return { ok: false, fieldErrors: { email: ["An account with this email already exists. Log in instead."] } };
  }

  const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
  const org = await Organization.create({ name: company, legalName: company, members: [{ userId: user._id, role: "owner" }] });
  await audit(org._id, { id: String(user._id), name }, "org.created", `${name} created the account`);
  await createSession({ uid: String(user._id), oid: String(org._id), sv: 0 });
  redirect("/dashboard/sites?welcome=1");
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { email, password } = parsed.data;

  if (!(await rateLimit(`login:${email}`, 8, 15 * 60_000)).allowed) {
    return fail("Too many attempts. Wait 15 minutes and try again.");
  }

  await connectDb();
  const user = await User.findOne({ email }).select("+passwordHash");
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) return fail("That email and password don't match.");

  const org = await Organization.findOne({ "members.userId": user._id }).sort({ createdAt: 1 }).select("_id");
  if (!org) return fail("Your account isn't linked to a business. Contact support.");

  // Two-factor users get no session yet: a 5-minute signed cookie carries them to the code step.
  if (user.twoFactorEnabled) {
    await createPending2fa({ uid: String(user._id), sv: user.sessionVersion ?? 0 });
    redirect(`/login/two-factor?next=${encodeURIComponent(safeNext(formData.get("next")))}`);
  }

  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  await createSession({ uid: String(user._id), oid: String(org._id), sv: user.sessionVersion ?? 0 });
  redirect(safeNext(formData.get("next")));
}

const SIGN_IN_EXPIRED = "Your sign-in timed out. Log in again.";

/** Second login step: an authenticator or recovery code, then the normal session. */
export async function verifyTwoFactorLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const pending = await readPending2fa();
  if (!pending) return fail(SIGN_IN_EXPIRED);
  const parsed = twoFactorCodeSchema.safeParse({ code: formData.get("code") ?? "" });
  if (!parsed.success) return fromZodError(parsed.error);

  const ip = clientIp({ headers: await headers() });
  const [byUser, byIp] = await Promise.all([
    rateLimit(`2fa-login:${pending.uid}`, 5, 15 * 60_000),
    rateLimit(`2fa-login-ip:${ip}`, 20, 15 * 60_000),
  ]);
  if (!byUser.allowed || !byIp.allowed) return fail("Too many attempts. Wait 15 minutes and try again.");

  await connectDb();
  const user = await User.findById(pending.uid).select("name email sessionVersion twoFactorEnabled").lean();
  // A password change or 2FA change since the first step bumps the session version.
  if (!user || (user.sessionVersion ?? 0) !== pending.sv) {
    await clearPending2fa();
    return fail(SIGN_IN_EXPIRED);
  }

  const method = await checkSecondFactor(pending.uid, parsed.data.code);
  if (!method) return { ok: false, fieldErrors: { code: ["That code didn't work. Check your app and try again."] } };

  const org = await Organization.findOne({ "members.userId": user._id }).sort({ createdAt: 1 }).select("_id").lean();
  if (!org) return fail("Your account isn't linked to a business. Contact support.");

  await clearPending2fa();
  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  if (method === "recovery") {
    const left = await recoveryCodesLeft(pending.uid);
    await audit(org._id, { id: pending.uid, name: user.name }, "account.recovery_code_used", `${user.name} signed in with a recovery code (${left} left)`);
    await sendMail(twoFactorChangedEmail({ to: user.email, name: user.name, event: "recovery_used", url: `${env().APP_URL}/dashboard/account` }));
  }
  await createSession({ uid: pending.uid, oid: String(org._id), sv: user.sessionVersion ?? 0 });
  redirect(safeNext(formData.get("next")));
}

/** Abandons a half-finished two-factor login. */
export async function cancelTwoFactorLoginAction(): Promise<void> {
  await clearPending2fa();
  redirect("/login");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { email } = parsed.data;
  const done = succeed("If an account exists for that email, a reset link is on its way.");

  if (!(await rateLimit(`reset:${email}`, 3, 60 * 60_000)).allowed) return done;

  await connectDb();
  const user = await User.findOne({ email });
  if (!user) return done;

  const token = randomToken(32);
  user.set({ resetTokenHash: sha256(token), resetTokenExpiresAt: new Date(Date.now() + 60 * 60_000) });
  await user.save();
  await sendMail(passwordResetEmail(email, `${env().APP_URL}/reset-password?token=${token}`));
  return done;
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  await connectDb();
  const user = await User.findOne({
    resetTokenHash: sha256(parsed.data.token),
    resetTokenExpiresAt: { $gt: new Date() },
  });
  if (!user) return fail("This reset link has expired. Request a new one.");

  // Bumping the session version signs out every other device.
  user.set({
    passwordHash: await hashPassword(parsed.data.password),
    resetTokenHash: undefined,
    resetTokenExpiresAt: undefined,
    sessionVersion: (user.sessionVersion ?? 0) + 1,
  });
  await user.save();
  // No automatic sign-in: logging in again keeps the two-factor step for users who have it.
  redirect("/login?reset=1");
}
