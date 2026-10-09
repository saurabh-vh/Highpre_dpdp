"use server";

import { revalidatePath } from "next/cache";
import { fail, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { Site } from "@/models";

/** Turns the public privacy centre and its vendor list on or off. */
export async function savePrivacyCentreAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "notice.publish")) return fail(denied("notice.publish"));
  const site = await requireSite(siteId);
  const enabled = formData.get("enabled") === "on";
  const showVendors = formData.get("showVendors") === "on";
  await Site.updateOne({ _id: site._id }, { "privacyCentre.enabled": enabled, "privacyCentre.showVendors": showVendors });
  await audit(
    org._id,
    user,
    "site.privacy_centre",
    `${enabled ? "Published" : "Unpublished"} the privacy centre for ${site.name}${enabled ? (showVendors ? ", with vendors" : ", without vendors") : ""}`,
    site._id,
  );
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  return succeed(enabled ? "Privacy centre settings saved." : "Privacy centre turned off. Its link now shows a not-available page.");
}
