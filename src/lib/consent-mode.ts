/**
 * Google Consent Mode v2 and Meta Pixel consent: which of a site's purposes
 * stand for which Google consent type, and the consent state a visitor's
 * decisions produce. Shared by the dashboard, the config API and widget.js
 * (which bundles this file), so keep it dependency-free.
 */

/** Google consent types a purpose can switch on. security_storage is always granted. */
export const GOOGLE_CONSENT_TYPES = [
  "analytics_storage",
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
  "functionality_storage",
  "personalization_storage",
] as const;

export type GoogleConsentType = (typeof GOOGLE_CONSENT_TYPES)[number];
export type ConsentValue = "granted" | "denied";
export type GoogleConsentState = Record<GoogleConsentType | "security_storage", ConsentValue>;
/** Purpose key → the Google consent types it grants. */
export type ConsentTypeMap = Record<string, GoogleConsentType[]>;

export const GOOGLE_CONSENT_LABELS: Record<GoogleConsentType, { label: string; hint: string }> = {
  analytics_storage: { label: "Analytics", hint: "Google Analytics cookies and visit measurement" },
  ad_storage: { label: "Ad storage", hint: "Advertising cookies (Google Ads, Floodlight)" },
  ad_user_data: { label: "Ad user data", hint: "Sending visitor data to Google for advertising" },
  ad_personalization: { label: "Ad personalisation", hint: "Remarketing and personalised ads" },
  functionality_storage: { label: "Functionality", hint: "Remembering settings such as language" },
  personalization_storage: { label: "Personalisation", hint: "Personalised content and recommendations" },
};

const ADS: GoogleConsentType[] = ["ad_storage", "ad_user_data", "ad_personalization"];

/** Sensible default by the purpose's key and name: analytics → analytics_storage, marketing → the three ad types. */
export function defaultConsentTypes(p: { key: string; name?: string; essential?: boolean | null }): GoogleConsentType[] {
  if (p.essential) return ["functionality_storage"];
  const s = (p.key + " " + (p.name || "")).toLowerCase();
  const out: GoogleConsentType[] = [];
  if (/market|advert|\bads?\b|remarket|retarget|targeting|campaign/.test(s)) out.push(...ADS);
  if (/analytic|measur|statistic|performance|insight/.test(s)) out.push("analytics_storage");
  if (/personali[sz]|recommend/.test(s)) out.push("personalization_storage");
  if (/function|preference/.test(s)) out.push("functionality_storage");
  return out;
}

function isType(t: unknown): t is GoogleConsentType {
  return (GOOGLE_CONSENT_TYPES as readonly unknown[]).indexOf(t) >= 0;
}

/** The mapping for each purpose: the saved choice when there is one, otherwise the default. */
export function resolveConsentTypes(
  purposes: { key: string; name?: string; essential?: boolean | null }[],
  saved?: { purpose: string; types?: string[] | null }[] | null,
): ConsentTypeMap {
  const map: ConsentTypeMap = {};
  for (const p of purposes) {
    const entry = (saved || []).find((s) => s.purpose === p.key);
    map[p.key] = entry ? (entry.types || []).filter(isType) : defaultConsentTypes(p);
  }
  return map;
}

/**
 * Google consent state for a visitor's decisions. A type is granted only when
 * at least one purpose stands for it and every such purpose is granted, so
 * nothing is switched on by a purpose the visitor didn't agree to. No
 * decisions (first visit, closed banner) means everything is denied.
 */
export function buildGoogleConsent(map: ConsentTypeMap, decisions?: Record<string, boolean> | null): GoogleConsentState {
  const state = { security_storage: "granted" } as GoogleConsentState;
  for (const type of GOOGLE_CONSENT_TYPES) {
    let mapped = false;
    let granted = true;
    for (const key in map) {
      if (map[key].indexOf(type) < 0) continue;
      mapped = true;
      if (!decisions || !decisions[key]) granted = false;
    }
    state[type] = mapped && granted ? "granted" : "denied";
  }
  return state;
}

/** Meta Pixel follows the purposes mapped to Google ad storage (normally "marketing"). */
export function metaConsent(google: GoogleConsentState): "grant" | "revoke" {
  return google.ad_storage === "granted" ? "grant" : "revoke";
}
