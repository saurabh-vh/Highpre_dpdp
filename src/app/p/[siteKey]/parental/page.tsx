import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ParentalPortal } from "@/features/parental/parental-portal";
import { connectDb } from "@/lib/db";
import { normalizeLanguages, pickLang, purposeText } from "@/lib/i18n";
import { isTracking } from "@/lib/constants";
import { Organization, Site } from "@/models";

export const metadata: Metadata = { title: "Parental consent", robots: { index: false } };

export default async function ParentalPage({ params, searchParams }: { params: Promise<{ siteKey: string }>; searchParams: Promise<{ lang?: string; pid?: string }> }) {
  const [{ siteKey }, { lang, pid }] = await Promise.all([params, searchParams]);
  await connectDb();
  const site = await Site.findOne({ siteKey }).select("orgId name languages purposes children publishedNoticeVersion").lean();
  if (!site || !site.children?.enabled || !site.publishedNoticeVersion) notFound();
  const org = await Organization.findById(site.orgId).select("name legalName").lean();
  if (!org) notFound();
  const languages = normalizeLanguages(site.languages);
  const principalId = pid && /^[A-Za-z0-9_-]{16,64}$/.test(pid) ? pid : null;

  return (
    <ParentalPortal
      siteKey={siteKey}
      principalId={principalId}
      businessName={org.legalName || org.name}
      languages={languages}
      initialLang={pickLang(lang, languages)}
      purposes={site.purposes.map((p) => ({
        key: p.key,
        essential: p.essential,
        tracking: isTracking(p),
        text: Object.fromEntries(languages.map((l) => [l, purposeText(p, l)])),
      }))}
    />
  );
}
