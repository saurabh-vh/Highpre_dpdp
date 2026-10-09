"use server";

import { revalidatePath } from "next/cache";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formSettingsSchema } from "@/lib/validation";
import { Site } from "@/models";

/** Which purposes appear on the website's forms, which are required, and automatic protection. */
export async function saveFormSettingsAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "content.edit")) return fail(denied("content.edit"));
  const site = await requireSite(siteId);
  const parsed = formSettingsSchema.safeParse({
    autoProtect: formData.get("autoProtect") === "on",
    purposes: formData.getAll("purposes").map(String),
    requiredPurposes: formData.getAll("requiredPurposes").map(String),
  });
  if (!parsed.success) return fromZodError(parsed.error);

  const known = new Set(site.purposes.map((p) => p.key));
  const purposes = parsed.data.purposes.filter((k) => known.has(k));
  // A purpose can only be required on forms that show it.
  const requiredPurposes = parsed.data.requiredPurposes.filter((k) => purposes.includes(k));
  if (parsed.data.autoProtect && purposes.length === 0) {
    return { ok: false, message: "Choose at least one purpose to show on your forms before turning on automatic protection." };
  }

  await Site.updateOne({ _id: site._id }, { forms: { autoProtect: parsed.data.autoProtect, purposes, requiredPurposes } });
  await audit(org._id, user, "site.forms", `Updated form consent settings for ${site.name}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}/forms`);
  return succeed("Form settings saved. Changes reach your website within a few minutes.");
}
