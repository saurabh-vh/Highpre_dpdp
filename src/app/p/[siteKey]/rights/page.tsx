import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RightsPortal } from "@/features/rights-portal/rights-portal";
import { connectDb } from "@/lib/db";
import { normalizeLanguages, pickLang } from "@/lib/i18n/languages";
import { Organization, Site } from "@/models";

export const metadata: Metadata = { title: "Data request", robots: { index: false } };

export default async function RightsPage({ params, searchParams }: { params: Promise<{ siteKey: string }>; searchParams: Promise<{ lang?: string }> }) {
  const [{ siteKey }, { lang }] = await Promise.all([params, searchParams]);
  await connectDb();
  const site = await Site.findOne({ siteKey }).select("orgId name languages").lean();
  if (!site) notFound();
  const org = await Organization.findById(site.orgId).select("name legalName").lean();
  if (!org) notFound();
  const languages = normalizeLanguages(site.languages);

  return <RightsPortal siteKey={siteKey} businessName={org.legalName || org.name} languages={languages} initialLang={pickLang(lang, languages)} />;
}
