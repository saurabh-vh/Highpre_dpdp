"use server";

import { revalidatePath } from "next/cache";
import { fail, fromZodError, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { requireAuthWithoutPolicy } from "@/lib/auth/guards";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from "@/lib/auth/totp";
import { checkSecondFactor } from "@/lib/auth/two-factor";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/mailer";
import { twoFactorChangedEmail } from "@/lib/mail/templates";
import { rateLimit } from "@/lib/rate-limit";
import { disableTwoFactorSchema, twoFactorCodeSchema } from "@/lib/validation";
import { Organization, User } from "@/models";

/** ActionState plus recovery codes, returned once (only their hashes are stored). */
export type TwoFactorState = ActionState & { recoveryCodes?: string[] };

const TOO_MANY = "Too many attempts. Wait 15 minutes and try again.";
const WRONG_CODE = "That code didn't work. Check your app and try again.";

const limited = async (userId: string) => !(await rateLimit(`2fa-manage:${userId}`, 10, 15 * 60_000)).allowed;

/** Logs a two-factor change in every organisation the user belongs to, and optionally emails them. */
async function recordChange(user: { id: string; name: string; email: string }, action: string, summary: string, event?: "enabled" | "disabled") {
  const orgs = await Organization.find({ "members.userId": user.id }).select("_id").lean();
  await Promise.all(orgs.map((o) => audit(o._id, user, action, summary)));
  if (event) await sendMail(twoFactorChangedEmail({ to: user.email, name: user.name, event, url: `${env().APP_URL}/dashboard/account` }));
}

/** Creates a fresh secret for the user to scan; nothing changes until a code confirms it. */
export async function startTwoFactorSetupAction(): Promise<void> {
  const { user } = await requireAuthWithoutPolicy();
  if (user.twoFactorEnabled) return;
  await User.updateOne({ _id: user.id }, { totpPendingSecret: encryptSecret(generateTotpSecret()) });
  revalidatePath("/dashboard/account");
}

export async function cancelTwoFactorSetupAction(): Promise<void> {
  const { user } = await requireAuthWithoutPolicy();
  await User.updateOne({ _id: user.id }, { $unset: { totpPendingSecret: 1 } });
  revalidatePath("/dashboard/account");
}

/** Confirms setup with a code from the app, turns 2FA on, signs out other devices and returns recovery codes. */
export async function confirmTwoFactorSetupAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const { user, org } = await requireAuthWithoutPolicy();
  const parsed = twoFactorCodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  if (await limited(user.id)) return fail(TOO_MANY);

  const doc = await User.findById(user.id).select("+totpPendingSecret sessionVersion twoFactorEnabled").lean();
  if (!doc || doc.twoFactorEnabled) return fail("Two-factor sign-in is already on.");
  if (!doc.totpPendingSecret) return fail("Setup expired. Start again.");
  let secret: string;
  try {
    secret = decryptSecret(doc.totpPendingSecret);
  } catch {
    return fail("Setup expired. Start again.");
  }
  const step = verifyTotp(secret, parsed.data.code);
  if (step === null) return { ok: false, fieldErrors: { code: [WRONG_CODE] } };

  const codes = generateRecoveryCodes();
  const sv = (doc.sessionVersion ?? 0) + 1;
  // Conditional on 2FA still being off, so a double submit can't issue two sets of codes.
  const res = await User.updateOne(
    { _id: user.id, twoFactorEnabled: { $ne: true }, totpPendingSecret: doc.totpPendingSecret },
    {
      $set: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
        totpSecret: doc.totpPendingSecret,
        totpLastStep: step,
        recoveryCodeHashes: codes.map(hashRecoveryCode),
        sessionVersion: sv,
      },
      $unset: { totpPendingSecret: 1 },
    },
  );
  if (res.modifiedCount !== 1) return fail("Two-factor sign-in is already on.");

  await createSession({ uid: user.id, oid: org.id, sv });
  await recordChange(user, "account.2fa_enabled", `${user.name} turned on two-factor sign-in`, "enabled");
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Two-factor sign-in is on. Other devices have been signed out.", recoveryCodes: codes };
}

/** Replaces every recovery code. Needs a current authenticator code. */
export async function regenerateRecoveryCodesAction(_prev: TwoFactorState, formData: FormData): Promise<TwoFactorState> {
  const { user } = await requireAuthWithoutPolicy();
  if (!user.twoFactorEnabled) return fail("Turn on two-factor sign-in first.");
  const parsed = twoFactorCodeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  if (await limited(user.id)) return fail(TOO_MANY);
  if (!(await checkSecondFactor(user.id, parsed.data.code, { allowRecovery: false }))) return { ok: false, fieldErrors: { code: [WRONG_CODE] } };

  const codes = generateRecoveryCodes();
  await User.updateOne({ _id: user.id }, { $set: { recoveryCodeHashes: codes.map(hashRecoveryCode) } });
  await recordChange(user, "account.2fa_recovery_codes", `${user.name} created new two-factor recovery codes`);
  revalidatePath("/dashboard/account");
  return { ok: true, message: "New recovery codes created. The old ones no longer work.", recoveryCodes: codes };
}

/** Turns 2FA off. Needs the password and a code (authenticator or recovery); signs out other devices. */
export async function disableTwoFactorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, org, role } = await requireAuthWithoutPolicy();
  const parsed = disableTwoFactorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  if (await limited(user.id)) return fail(TOO_MANY);

  const doc = await User.findById(user.id).select("+passwordHash sessionVersion twoFactorEnabled");
  if (!doc?.twoFactorEnabled) return fail("Two-factor sign-in is already off.");
  if (!(await verifyPassword(parsed.data.currentPassword, doc.passwordHash))) {
    return { ok: false, fieldErrors: { currentPassword: ["That isn't your current password."] } };
  }
  if (!(await checkSecondFactor(user.id, parsed.data.code))) return { ok: false, fieldErrors: { code: [WRONG_CODE] } };

  const sv = (doc.sessionVersion ?? 0) + 1;
  await User.updateOne(
    { _id: user.id },
    {
      $set: { twoFactorEnabled: false, sessionVersion: sv },
      $unset: { twoFactorEnabledAt: 1, totpSecret: 1, totpPendingSecret: 1, totpLastStep: 1, recoveryCodeHashes: 1 },
    },
  );
  await createSession({ uid: user.id, oid: org.id, sv });
  await recordChange(user, "account.2fa_disabled", `${user.name} turned off two-factor sign-in`, "disabled");
  revalidatePath("/dashboard", "layout");
  const required = org.requireTwoFactor && (role === "owner" || role === "admin");
  return {
    ok: true,
    message: required
      ? `Two-factor sign-in is off. ${org.name} requires it for owners and admins, so turn it on again to keep working.`
      : "Two-factor sign-in is off. Other devices have been signed out.",
  };
}
