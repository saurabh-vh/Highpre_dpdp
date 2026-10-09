import { DEFAULT_RESPONSE_DAYS } from "@/lib/constants";
import { purposeText, type Lang, type PurposeTranslation } from "@/lib/i18n";
import { vendorCategoryLabel } from "@/lib/vendors/constants";

/**
 * Turns stored records into what the public privacy centre (/p/<siteKey>)
 * shows. Pure functions: no database, no request, so they're easy to test.
 * Only facts the business has published or HighPre observed are shown.
 */

type SiteLike = {
  _id: unknown;
  name: string;
  url: string;
  publishedNoticeVersion?: number | null;
  children?: { enabled?: boolean | null } | null;
  privacyCentre?: { enabled?: boolean | null; showVendors?: boolean | null } | null;
  banner?: { showReopenButton?: boolean | null } | null;
  purposes: {
    key: string;
    name: string;
    description: string;
    translations?: PurposeTranslation[] | null;
    nameHi?: string | null;
    descriptionHi?: string | null;
    essential?: boolean | null;
  }[];
};

type OrgLike = {
  name: string;
  legalName?: string | null;
  grievanceOfficerName?: string | null;
  grievanceEmail?: string | null;
  grievancePhone?: string | null;
  responseDays?: number | null;
};

type NoticeLike = { version: number; createdAt?: Date | null; languages?: string[] | null; content?: Record<string, { title?: string; intro?: string } | undefined> | null };

type ScanLike = {
  createdAt?: Date | null;
  consentTool?: string | null;
  trackers: { id?: string | null; name?: string | null; category?: string | null }[];
  cookies?: string[] | null;
};

type VendorLike = {
  name: string;
  category?: string | null;
  processingCountry?: string | null;
  source?: string | null;
  siteIds?: unknown[] | null;
  archivedAt?: Date | null;
};

/** Published notice and the switch (on unless turned off). */
export function isPrivacyCentreAvailable(site: Pick<SiteLike, "publishedNoticeVersion" | "privacyCentre">): boolean {
  return (site.publishedNoticeVersion ?? 0) > 0 && site.privacyCentre?.enabled !== false;
}

const TRACKER_PURPOSE: Record<string, string> = {
  analytics: "Measures how visitors use the website, such as pages viewed and time spent.",
  marketing: "Measures and personalises advertising, including on other websites and apps.",
  session_recording: "Records clicks, scrolls and page interactions to improve the website.",
  support: "Runs the live chat or support widget.",
};

export type TrackerView = { name: string; category: string; purpose: string; waitsForConsent: boolean };

/**
 * Trackers from the latest scan. `waitsForConsent` only means a consent tool
 * was found on the site: the scan can't tell whether each tracker is actually
 * held back, so the page must not promise that it is. Support widgets are
 * treated as part of the service the visitor asks for.
 */
export function shapeTrackers(scan: ScanLike | null | undefined): TrackerView[] {
  if (!scan) return [];
  const gated = Boolean(scan.consentTool);
  const seen = new Set<string>();
  const out: TrackerView[] = [];
  for (const t of scan.trackers) {
    const key = t.id || t.name;
    if (!t.name || !key || seen.has(key)) continue;
    seen.add(key);
    const category = t.category ?? "other";
    out.push({
      name: t.name,
      category: vendorCategoryLabel(category),
      purpose: TRACKER_PURPOSE[category] ?? "Third-party service used on the website.",
      waitsForConsent: category === "support" ? true : gated,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Common cookies whose job is to keep a site working or secure. */
const ESSENTIAL_COOKIES = [/^PHPSESSID$/i, /^JSESSIONID$/i, /^ASP\.NET_SessionId$/i, /^connect\.sid$/i, /_session$/i, /^csrftoken$/i, /^XSRF-TOKEN$/i, /^__cf_bm$/i, /^cf_clearance$/i, /^_cfuvid$/i, /^__Host-/, /^__Secure-/];

export type CookieView = { name: string; essential: boolean };

/** Cookie names the website set when HighPre loaded its pages (before any choice). */
export function shapeCookies(scan: ScanLike | null | undefined): CookieView[] {
  const names = [...new Set((scan?.cookies ?? []).map((c) => c.trim()).filter(Boolean))].slice(0, 30);
  return names.map((name) => ({ name, essential: ESSENTIAL_COOKIES.some((p) => p.test(name)) })).sort((a, b) => a.name.localeCompare(b.name));
}

export type VendorView = { name: string; category: string; country: string };

/**
 * Active vendors for this site: scan-detected vendors still found on it, and
 * vendors added by hand (organisation-wide). Archived ones are left out.
 */
export function shapeVendors(vendors: VendorLike[], siteId: unknown): VendorView[] {
  const id = String(siteId);
  return vendors
    .filter((v) => !v.archivedAt)
    .filter((v) => (v.siteIds ?? []).some((s) => String(s) === id) || (v.source === "manual" && !(v.siteIds ?? []).length))
    .map((v) => ({ name: v.name, category: vendorCategoryLabel(v.category ?? "other"), country: v.processingCountry?.trim() || "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type PrivacyCentreView = {
  businessName: string;
  siteName: string;
  siteUrl: string;
  siteHost: string;
  notice: { version: number; updatedAt: Date | null; languages: Lang[]; title: string; intro: string };
  purposes: { key: string; name: string; description: string; essential: boolean }[];
  contact: { officer: string; email: string; phone: string; responseDays: number } | null;
  parentalConsent: boolean;
  /** The widget's floating privacy button is shown on the website. */
  reopenButton: boolean;
  trackers: TrackerView[];
  cookies: CookieView[];
  vendors: VendorView[] | null;
  lastCheckedAt: Date | null;
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Everything the privacy centre page renders, in the visitor's language where the business has provided it. */
export function buildPrivacyCentre(input: {
  site: SiteLike;
  org: OrgLike;
  notice: NoticeLike;
  languages: Lang[];
  lang: Lang;
  scan?: ScanLike | null;
  vendors?: VendorLike[];
}): PrivacyCentreView {
  const { site, org, notice, lang } = input;
  const content = notice.content?.[lang] ?? notice.content?.en;
  const contact = org.grievanceOfficerName || org.grievanceEmail || org.grievancePhone
    ? { officer: org.grievanceOfficerName ?? "", email: org.grievanceEmail ?? "", phone: org.grievancePhone ?? "", responseDays: org.responseDays ?? DEFAULT_RESPONSE_DAYS }
    : null;
  return {
    businessName: org.legalName || org.name,
    siteName: site.name,
    siteUrl: site.url,
    siteHost: hostOf(site.url),
    notice: {
      version: notice.version,
      updatedAt: notice.createdAt ?? null,
      languages: input.languages,
      title: content?.title ?? "",
      intro: content?.intro ?? "",
    },
    purposes: site.purposes.map((p) => ({ key: p.key, ...purposeText(p, lang), essential: Boolean(p.essential) })),
    contact,
    parentalConsent: Boolean(site.children?.enabled),
    reopenButton: site.banner?.showReopenButton !== false,
    trackers: shapeTrackers(input.scan),
    cookies: shapeCookies(input.scan),
    vendors: site.privacyCentre?.showVendors ? shapeVendors(input.vendors ?? [], site._id) : null,
    lastCheckedAt: input.scan?.createdAt ?? null,
  };
}
