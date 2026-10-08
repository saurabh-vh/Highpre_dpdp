import type { PresetKey } from "@/lib/constants";
import type { Lang } from "./languages";
import type { Locale } from "./types";
import { bn } from "./locales/bn";
import { en } from "./locales/en";
import { gu } from "./locales/gu";
import { hi } from "./locales/hi";
import { kn } from "./locales/kn";
import { mr } from "./locales/mr";
import { ta } from "./locales/ta";
import { te } from "./locales/te";

export * from "./languages";
export type { Locale, WidgetStrings } from "./types";

const LOCALES: Record<Lang, Locale> = { en, hi, bn, mr, ta, te, gu, kn };

export function getLocale(lang: string): Locale {
  return LOCALES[lang as Lang] ?? en;
}

export type PurposeTranslation = { lang: string; name?: string | null; description?: string | null };

type PurposeLike = {
  key: string;
  name: string;
  description: string;
  translations?: PurposeTranslation[] | null;
  /** Legacy Hindi fields from before multi-language support. */
  nameHi?: string | null;
  descriptionHi?: string | null;
};

/**
 * A purpose's wording in one language. Uses, in order: the business's own
 * translation, legacy Hindi fields, the preset translation (only while the
 * English text still matches the preset), then the English text.
 */
export function purposeText(p: PurposeLike, lang: string): { name: string; description: string } {
  if (lang === "en") return { name: p.name, description: p.description };
  const own = p.translations?.find((t) => t.lang === lang);
  const legacy = lang === "hi" ? { name: p.nameHi, description: p.descriptionHi } : null;
  const presetEn = en.purposes[p.key as PresetKey];
  const preset = presetEn ? getLocale(lang).purposes[p.key as PresetKey] : undefined;
  return {
    name: own?.name || legacy?.name || (presetEn && p.name === presetEn.name ? preset?.name : "") || p.name,
    description:
      own?.description || legacy?.description || (presetEn && p.description === presetEn.description ? preset?.description : "") || p.description,
  };
}

export const categoryLabelIn = (category: string, lang: string) =>
  getLocale(lang).categories[category as keyof Locale["categories"]] ?? category;

export const requestTypeLabelIn = (type: string, lang: string) =>
  getLocale(lang).requestTypes[type as keyof Locale["requestTypes"]] ?? type;

/** Formats a date for a notice in the reader's language. */
export function formatDateIn(date: Date, intl: string): string {
  try {
    return new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric" }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(date);
  }
}
