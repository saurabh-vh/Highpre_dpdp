"use server";

import { revalidatePath } from "next/cache";
import { fail, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { Site } from "@/models";

/** Turns the public privacy centre, its vendor list and the website badge on or off. */
export async function savePrivacyCentreAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "notice.publish")) return fail(denied("notice.publish"));
  const site = await requireSite(siteId);
  const enabled = formData.get("enabled") === "on";
  const showVendors = formData.get("showVendors") === "on";
  const badge = {
    enabled: formData.get("badge") === "on",
    placement: formData.get("badgePlacement") === "corner" ? "corner" : "footer",
    theme: formData.get("badgeTheme") === "dark" ? "dark" : "light",
    size: formData.get("badgeSize") === "small" ? "small" : "regular",
  };
  await Site.updateOne(
    { _id: site._id },
    { "privacyCentre.enabled": enabled, "privacyCentre.showVendors": showVendors, "privacyCentre.badge": badge },
  );
  await audit(
    org._id,
    user,
    "site.privacy_centre",
    `${enabled ? "Published" : "Unpublished"} the privacy centre for ${site.name}${enabled ? (showVendors ? ", with vendors" : ", without vendors") : ""}${enabled && badge.enabled ? `, badge shown (${badge.placement})` : ", badge hidden"}`,
    site._id,
  );
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  if (!enabled) return succeed("Privacy centre turned off. Its link now shows a not-available page, and the badge is hidden.");
  return succeed(badge.enabled ? "Saved. The badge appears on your website within a few minutes." : "Privacy centre settings saved.");
}
