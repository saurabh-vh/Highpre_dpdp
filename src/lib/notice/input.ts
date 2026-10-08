import "server-only";
import { env } from "@/lib/env";
import { normalizeLanguages, type Lang } from "@/lib/i18n/languages";
import type { NoticeInput } from "./generate";

type OrgLike = {
  name: string;
  legalName?: string | null;
  address?: string | null;
  grievanceOfficerName?: string | null;
  grievanceEmail?: string | null;
  grievancePhone?: string | null;
  responseDays: number;
};
type SiteLike = { name: string; siteKey: string; purposes: NoticeInput["purposes"]; children?: { enabled?: boolean | null } | null };

/** Everything the notice generator needs, from the organisation and site. */
export function noticeInputFor(org: OrgLike, site: SiteLike, version: number): NoticeInput {
  return {
    businessName: org.legalName || org.name,
    siteName: site.name,
    address: org.address ?? undefined,
    grievanceOfficerName: org.grievanceOfficerName ?? undefined,
    grievanceEmail: org.grievanceEmail ?? undefined,
    grievancePhone: org.grievancePhone ?? undefined,
    responseDays: org.responseDays,
    rightsUrl: `${env().APP_URL}/p/${site.siteKey}/rights`,
    version,
    effectiveDate: new Date(),
    purposes: site.purposes,
    children: Boolean(site.children?.enabled),
  };
}

/** The site's languages, trimmed to what the plan allows (English always first). */
export function publishableLanguages(siteLanguages: readonly string[] | null | undefined, max: number): { languages: Lang[]; dropped: Lang[] } {
  const all = normalizeLanguages(siteLanguages);
  return { languages: all.slice(0, Math.max(1, max)), dropped: all.slice(Math.max(1, max)) };
}
