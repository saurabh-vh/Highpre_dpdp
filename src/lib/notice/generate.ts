import { categoryLabelIn, formatDateIn, getLocale, languageOf, purposeText, type Lang, type PurposeTranslation } from "@/lib/i18n";

/**
 * Builds a plain-language privacy notice from the data inventory, in every
 * language the site offers. The wording is a starting template: have it
 * reviewed by a privacy lawyer before relying on it for real customers.
 */

type Purpose = {
  key: string;
  name: string;
  description: string;
  translations?: PurposeTranslation[] | null;
  nameHi?: string | null;
  descriptionHi?: string | null;
  dataCategories: string[];
  essential: boolean;
  retentionDays: number;
  sharedWith?: string | null;
};

export type NoticeInput = {
  businessName: string;
  siteName: string;
  address?: string;
  grievanceOfficerName?: string;
  grievanceEmail?: string;
  grievancePhone?: string;
  responseDays: number;
  rightsUrl: string;
  version: number;
  effectiveDate: Date;
  purposes: Purpose[];
  /** Adds the section on parental consent for under-18s. */
  children?: boolean;
};

export type NoticeSection = { heading: string; body: string };
export type NoticeLanguageContent = { title: string; intro: string; sections: NoticeSection[] };
export type NoticeContent = Partial<Record<Lang, NoticeLanguageContent>>;

export function retentionText(days: number, lang: string): string {
  const r = getLocale(lang).notice.retention;
  if (days % 365 === 0) return r.years(days / 365);
  if (days % 30 === 0) return r.months(days / 30);
  return r.days(days);
}

function contactLines(input: NoticeInput, lang: string): string {
  const l = getLocale(lang).notice.contactLabels;
  const lines: string[] = [];
  if (input.grievanceOfficerName) lines.push(`${l.officer}: ${input.grievanceOfficerName}`);
  if (input.grievanceEmail) lines.push(`${l.email}: ${input.grievanceEmail}`);
  if (input.grievancePhone) lines.push(`${l.phone}: ${input.grievancePhone}`);
  if (input.address) lines.push(`${l.address}: ${input.address}`);
  return lines.join("\n");
}

export function generateNoticeIn(input: NoticeInput, lang: Lang): NoticeLanguageContent {
  const t = getLocale(lang).notice;
  const date = formatDateIn(input.effectiveDate, languageOf(lang).intl);

  const purposes = input.purposes
    .map((p) => {
      const text = purposeText(p, lang);
      return t.purposeLine({
        name: text.name,
        description: text.description,
        categories: p.dataCategories.map((c) => categoryLabelIn(c, lang)).join(", ") || t.notSpecified,
        retention: retentionText(p.retentionDays, lang),
        essential: p.essential,
        sharedWith: p.sharedWith || undefined,
      });
    })
    .join("\n");

  const sections: NoticeSection[] = [
    { heading: t.collectHeading, body: purposes || t.collectNone },
    { heading: t.choicesHeading, body: t.choicesBody },
    { heading: t.rightsHeading, body: t.rightsBody(input.rightsUrl) },
    { heading: t.contactHeading, body: `${contactLines(input, lang) || t.contactNone}\n${t.respondWithin(input.responseDays)}` },
  ];
  if (input.children) sections.push({ heading: t.childrenHeading, body: t.childrenBody });
  sections.push(
    { heading: t.complaintsHeading, body: t.complaintsBody },
    { heading: t.changesHeading, body: t.changesBody(input.version, date) },
  );

  return { title: t.title(input.siteName), intro: t.intro(input.businessName), sections };
}

export function generateNotice(input: NoticeInput, languages: readonly Lang[]): NoticeContent {
  const content: NoticeContent = {};
  for (const lang of languages) content[lang] = generateNoticeIn(input, lang);
  return content;
}
