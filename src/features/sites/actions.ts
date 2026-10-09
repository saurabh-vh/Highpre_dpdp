"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { siteLimitReached } from "@/lib/billing/usage";
import { PURPOSE_PRESETS } from "@/lib/constants";
import { randomToken } from "@/lib/crypto";
import { languageLabel, normalizeLanguages } from "@/lib/i18n/languages";
import { scanSite } from "@/lib/scanner/run-site-scan";
import { siteLanguagesSchema, siteSchema } from "@/lib/validation";
import { ConsentRecord, Notice, ParentalConsent, RightsRequest, Scan, Site } from "@/models";

export async function createSiteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role, plan } = await requireAuth();
  if (!can(role, "sites.manage")) return fail(denied("sites.manage"));
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const limit = siteLimitReached(plan, await Site.countDocuments({ orgId: org._id }));
  if (limit) return fail(limit);

  const essential = PURPOSE_PRESETS.find((p) => p.key === "essential")!;
  const site = await Site.create({
    orgId: org._id,
    name: parsed.data.name,
    url: parsed.data.url,
    siteKey: randomToken(12),
    purposes: [{ ...essential, dataCategories: [...essential.dataCategories] }],
  });
  await audit(org._id, user, "site.created", `Added the website ${site.name}`, site._id);

  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/sites/${site._id}?new=1`);
}

/** Runs the scanner against a site the organisation owns and stores the result. */
export async function runSiteScanAction(siteId: string): Promise<ActionState> {
  const { role } = await requireAuth();
  if (!can(role, "content.edit")) return fail(denied("content.edit"));
  const site = await requireSite(siteId);
  const outcome = await scanSite(site, { trigger: "manual" });
  if (!outcome.ok) return fail(outcome.error);
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/vendors");
  return { ok: true, message: "Scan complete." };
}

export async function updateSiteAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "sites.manage")) return fail(denied("sites.manage"));
  const site = await requireSite(siteId);
  const parsed = siteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  await Site.updateOne({ _id: site._id }, parsed.data);
  await audit(org._id, user, "site.updated", `Renamed or moved ${site.name} to ${parsed.data.name} (${parsed.data.url})`, site._id);
  revalidatePath("/dashboard", "layout");
  return succeed("Website details saved.");
}

/** Chooses the languages for this site's notice, banner and request pages. */
export async function saveSiteLanguagesAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role, plan } = await requireAuth();
  if (!can(role, "notice.publish")) return fail(denied("notice.publish"));
  const site = await requireSite(siteId);
  const parsed = siteLanguagesSchema.safeParse({ languages: ["en", ...formData.getAll("languages")] });
  if (!parsed.success) return fail("Choose at least one language.");
  const languages = normalizeLanguages(parsed.data.languages);
  if (languages.length > plan.limits.languages) {
    return fail(`Your ${plan.name} plan includes ${plan.limits.languages} languages. Upgrade to offer more.`);
  }
  const update: Record<string, unknown> = { languages };
  if (!languages.includes(site.banner?.defaultLanguage as never)) update["banner.defaultLanguage"] = "en";
  await Site.updateOne({ _id: site._id }, update);
  await audit(org._id, user, "site.languages", `Set ${site.name} languages to ${languages.map(languageLabel).join(", ")}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  return succeed("Languages saved. Publish your notice again so every language has a published version.");
}

export async function saveChildrenSettingsAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "notice.publish")) return fail(denied("notice.publish"));
  const site = await requireSite(siteId);
  const enabled = formData.get("enabled") === "on";
  await Site.updateOne({ _id: site._id }, { "children.enabled": enabled });
  await audit(org._id, user, "site.children", `${enabled ? "Turned on" : "Turned off"} the age check and parental consent for ${site.name}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  return succeed(enabled ? "Age check on. Publish your notice again to add the section on children." : "Age check off.");
}

/** Weekly automatic rescans, with an email when something gets worse. */
export async function saveMonitoringSettingsAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "sites.manage")) return fail(denied("sites.manage"));
  const site = await requireSite(siteId);
  const enabled = formData.get("enabled") === "on";
  await Site.updateOne({ _id: site._id }, { "monitoring.enabled": enabled });
  await audit(org._id, user, "site.monitoring", `${enabled ? "Turned on" : "Turned off"} weekly monitoring for ${site.name}`, site._id);
  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  return succeed(enabled ? "Weekly monitoring on." : "Weekly monitoring off.");
}

export async function deleteSiteAction(siteId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "sites.manage")) return fail(denied("sites.manage"));
  const site = await requireSite(siteId);
  if (formData.get("confirm") !== site.name) return fail(`Type "${site.name}" to confirm.`);

  // Removing a site removes its consent evidence too, hence the typed confirmation.
  await Promise.all([
    Scan.deleteMany({ siteId: site._id }),
    Notice.deleteMany({ siteId: site._id }),
    ConsentRecord.deleteMany({ siteId: site._id }),
    ParentalConsent.deleteMany({ siteId: site._id }),
    RightsRequest.deleteMany({ siteId: site._id }),
  ]);
  await Site.deleteOne({ _id: site._id });
  await audit(org._id, user, "site.deleted", `Deleted the website ${site.name} and all its records`);
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/sites");
}
