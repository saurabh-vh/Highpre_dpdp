"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { requireAuthWithoutPolicy } from "@/lib/auth/guards";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { changePasswordSchema, profileSchema } from "@/lib/validation";
import { User } from "@/models";

// These use requireAuthWithoutPolicy: the Account page must keep working for owners and
// admins whose organisation requires two-factor sign-in they haven't turned on yet.

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAuthWithoutPolicy();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  await User.updateOne({ _id: user.id }, { name: parsed.data.name });
  revalidatePath("/dashboard", "layout");
  return succeed("Profile saved.");
}

/** Changes the password and signs out every other device; this one stays signed in. */
export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, org } = await requireAuthWithoutPolicy();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  if (!(await rateLimit(`password:${user.id}`, 5, 15 * 60_000)).allowed) return fail("Too many attempts. Wait 15 minutes and try again.");

  const doc = await User.findById(user.id).select("+passwordHash sessionVersion");
  if (!doc || !(await verifyPassword(parsed.data.currentPassword, doc.passwordHash))) {
    return { ok: false, fieldErrors: { currentPassword: ["That isn't your current password."] } };
  }
  const sv = (doc.sessionVersion ?? 0) + 1;
  doc.set({ passwordHash: await hashPassword(parsed.data.password), sessionVersion: sv });
  await doc.save();
  await createSession({ uid: user.id, oid: org.id, sv });
  return succeed("Password changed. Other devices have been signed out.");
}

export async function logoutEverywhereAction(): Promise<void> {
  const { user } = await requireAuthWithoutPolicy();
  await User.updateOne({ _id: user.id }, { $inc: { sessionVersion: 1 } });
  await destroySession();
  redirect("/login");
}
