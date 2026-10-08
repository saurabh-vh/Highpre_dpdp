"use server";

import { revalidatePath } from "next/cache";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { normalizeLanguages } from "@/lib/i18n/languages";
import { bannerSchema } from "@/lib/validation";
import { Site } from "@/models";

export async function saveBannerAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "content.edit")) return fail(denied("content.edit"));
  const site = await requireSite(siteId);
  const parsed = bannerSchema.safeParse({
    ...Object.fromEntries(formData),
    showReopenButton: formData.get("showReopenButton") === "on",
  });
  if (!parsed.success) return fromZodError(parsed.error);

  if (!normalizeLanguages(site.languages).includes(parsed.data.defaultLanguage)) {
    return { ok: false, fieldErrors: { defaultLanguage: ["Turn this language on in the website's settings first."] } };
  }
  await Site.updateOne({ _id: site._id }, { banner: parsed.data });
  await audit(org._id, user, "banner.updated", `Updated the consent banner for ${site.name}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}/banner`);
  return succeed("Banner saved. Changes reach your website within a few minutes.");
}
