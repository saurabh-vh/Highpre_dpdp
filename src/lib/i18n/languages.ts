/**
 * Languages HighPre can publish notices, banners and request pages in.
 * DPDP lets a person read a notice in English or any language in the Eighth
 * Schedule of the Constitution; add more by creating a locale file.
 * Client-safe: imported by both server code and client components.
 */
export const LANGUAGES = [
  { code: "en", label: "English", native: "English", intl: "en-IN" },
  { code: "hi", label: "Hindi", native: "हिंदी", intl: "hi-IN" },
  { code: "bn", label: "Bengali", native: "বাংলা", intl: "bn-IN" },
  { code: "mr", label: "Marathi", native: "मराठी", intl: "mr-IN" },
  { code: "ta", label: "Tamil", native: "தமிழ்", intl: "ta-IN" },
  { code: "te", label: "Telugu", native: "తెలుగు", intl: "te-IN" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", intl: "gu-IN" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", intl: "kn-IN" },
] as const;

export type Lang = (typeof LANGUAGES)[number]["code"];
export const LANG_CODES = LANGUAGES.map((l) => l.code) as [Lang, ...Lang[]];
export const DEFAULT_SITE_LANGUAGES: Lang[] = ["en", "hi"];

export const isLang = (value: unknown): value is Lang => typeof value === "string" && (LANG_CODES as string[]).includes(value);
export const languageOf = (code: string) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
export const languageLabel = (code: string) => languageOf(code).label;
export const nativeName = (code: string) => languageOf(code).native;

/** Picks a supported language from a query value, falling back to the first allowed one. */
export function pickLang(value: unknown, allowed: readonly string[] = LANG_CODES): Lang {
  if (isLang(value) && allowed.includes(value)) return value;
  return (allowed.find(isLang) ?? "en") as Lang;
}

/**
 * Orders a site's languages with English first and drops unknown codes.
 * Sites saved before languages were configurable (no value) offered English and Hindi.
 */
export function normalizeLanguages(codes: readonly string[] | null | undefined): Lang[] {
  const set = new Set((codes ?? DEFAULT_SITE_LANGUAGES).filter(isLang));
  set.add("en");
  return LANG_CODES.filter((c) => set.has(c));
}
