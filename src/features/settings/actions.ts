"use server";

import { revalidatePath } from "next/cache";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { orgSettingsSchema } from "@/lib/validation";
import { Organization } from "@/models";

export async function saveOrgSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "settings")) return fail(denied("settings"));
  const parsed = orgSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  await Organization.updateOne({ _id: org._id }, parsed.data);
  await audit(org._id, user, "settings.updated", "Updated business and grievance contact details");
  revalidatePath("/dashboard", "layout");
  return succeed("Settings saved. Publish your notices again to include these changes.");
}

/** Owner-only: require two-factor sign-in for owners and admins. The owner must have it on first. */
export async function saveTwoFactorPolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (role !== "owner") return fail("Only an owner can change this.");
  const required = formData.get("requireTwoFactor") === "on";
  if (required && !user.twoFactorEnabled) {
    return fail("Turn on two-factor sign-in for your own account first (Your account → Two-factor sign-in).");
  }
  if (required === Boolean(org.requireTwoFactor)) return succeed("Saved.");

  await Organization.updateOne({ _id: org._id }, { requireTwoFactor: required });
  await audit(org._id, user, "settings.2fa_policy", required ? "Required two-factor sign-in for owners and admins" : "Stopped requiring two-factor sign-in");
  revalidatePath("/dashboard", "layout");
  return succeed(required ? "Saved. Owners and admins without two-factor sign-in will be asked to turn it on." : "Saved. Two-factor sign-in is now optional.");
}
