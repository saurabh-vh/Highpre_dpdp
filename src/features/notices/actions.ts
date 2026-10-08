"use server";

import { revalidatePath } from "next/cache";
import { fail, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { noticeInputFor, publishableLanguages } from "@/lib/notice/input";
import { generateNotice } from "@/lib/notice/generate";
import { languageLabel } from "@/lib/i18n/languages";
import { Notice, Site } from "@/models";

/** Snapshots the current inventory into a new, immutable notice version. */
export async function publishNoticeAction(siteId: string): Promise<ActionState> {
  const { org, user, role, plan } = await requireAuth();
  if (!can(role, "notice.publish")) return fail(denied("notice.publish"));
  const site = await requireSite(siteId);
  if (site.purposes.length === 0) return fail("Add at least one purpose to your data inventory first.");
  if (!org.grievanceEmail) return fail("Add a grievance contact email in Business settings first. It must appear in your notice.");

  const version = (site.publishedNoticeVersion ?? 0) + 1;
  const { languages, dropped } = publishableLanguages(site.languages, plan.limits.languages);
  const content = generateNotice(noticeInputFor(org, site, version), languages);

  await Notice.create({ siteId: site._id, version, content, languages, purposeKeys: site.purposes.map((p) => p.key), publishedBy: user.id });
  await Site.updateOne({ _id: site._id }, { publishedNoticeVersion: version });
  await audit(org._id, user, "notice.published", `Published notice version ${version} for ${site.name} (${languages.map(languageLabel).join(", ")})`, site._id);

  revalidatePath(`/dashboard/sites/${siteId}`, "layout");
  revalidatePath("/dashboard");
  const note = dropped.length ? ` ${dropped.map(languageLabel).join(", ")} left out: your plan includes ${plan.limits.languages} languages.` : "";
  return succeed(`Version ${version} published. Visitors will be asked to confirm their choices again.${note}`);
}
