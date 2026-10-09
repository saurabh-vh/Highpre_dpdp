import { describe, expect, it } from "vitest";
import { buildGoogleConsent, defaultConsentTypes, metaConsent, resolveConsentTypes } from "@/lib/consent-mode";
import { bannerLayout, safeFontFamily } from "@/lib/banner-layout";
import { contrast, ensureContrast, readableOn } from "@/lib/color";

const purposes = [
  { key: "essential", name: "Essential site operation", essential: true },
  { key: "enquiries", name: "Responding to your enquiries", essential: false },
  { key: "analytics", name: "Understanding how the site is used", essential: false },
  { key: "marketing", name: "Marketing and advertising", essential: false },
];

describe("default consent type mapping", () => {
  it("maps purposes by key and name", () => {
    expect(defaultConsentTypes(purposes[0])).toEqual(["functionality_storage"]);
    expect(defaultConsentTypes(purposes[1])).toEqual([]);
    expect(defaultConsentTypes(purposes[2])).toEqual(["analytics_storage"]);
    expect(defaultConsentTypes(purposes[3])).toEqual(["ad_storage", "ad_user_data", "ad_personalization"]);
    expect(defaultConsentTypes({ key: "ads", name: "Remarketing" })).toContain("ad_personalization");
    expect(defaultConsentTypes({ key: "stats", name: "Site statistics" })).toEqual(["analytics_storage"]);
  });

  it("prefers saved choices, drops unknown types and defaults new purposes", () => {
    const map = resolveConsentTypes(purposes, [
      { purpose: "analytics", types: ["analytics_storage", "personalization_storage", "bogus"] },
      { purpose: "marketing", types: [] },
    ]);
    expect(map.analytics).toEqual(["analytics_storage", "personalization_storage"]);
    expect(map.marketing).toEqual([]);
    expect(map.essential).toEqual(["functionality_storage"]);
  });
});

describe("Google consent state", () => {
  const map = resolveConsentTypes(purposes);

  it("denies everything but security storage without decisions", () => {
    const s = buildGoogleConsent(map, null);
    expect(s).toEqual({
      security_storage: "granted",
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "denied",
      personalization_storage: "denied",
    });
    expect(metaConsent(s)).toBe("revoke");
  });

  it("grants only what the visitor agreed to", () => {
    const s = buildGoogleConsent(map, { essential: true, analytics: true, marketing: false });
    expect(s.analytics_storage).toBe("granted");
    expect(s.functionality_storage).toBe("granted");
    expect(s.ad_storage).toBe("denied");
    expect(s.personalization_storage).toBe("denied"); // no purpose stands for it
    expect(metaConsent(s)).toBe("revoke");

    const all = buildGoogleConsent(map, { essential: true, analytics: true, marketing: true });
    expect([all.ad_storage, all.ad_user_data, all.ad_personalization]).toEqual(["granted", "granted", "granted"]);
    expect(metaConsent(all)).toBe("grant");
  });

  it("needs every purpose mapped to a type before granting it", () => {
    const shared = { analytics: ["analytics_storage" as const], marketing: ["analytics_storage" as const, "ad_storage" as const] };
    expect(buildGoogleConsent(shared, { analytics: true, marketing: false }).analytics_storage).toBe("denied");
    expect(buildGoogleConsent(shared, { analytics: true, marketing: true }).analytics_storage).toBe("granted");
  });

  it("treats a withdrawal as an update back to denied", () => {
    const before = buildGoogleConsent(map, { essential: true, marketing: true });
    const after = buildGoogleConsent(map, { essential: true, marketing: false });
    expect(before.ad_user_data).toBe("granted");
    expect(after.ad_user_data).toBe("denied");
  });
});

describe("banner layout and colour helpers", () => {
  it("maps banners saved before layouts to the closest layout", () => {
    expect(bannerLayout({ position: "bottom" })).toBe("bar");
    expect(bannerLayout({ position: "bottom-left" })).toBe("box");
    expect(bannerLayout({ position: "bottom-right", layout: null })).toBe("box");
    expect(bannerLayout({ position: "bottom", layout: "popup" })).toBe("popup");
  });

  it("accepts font names only", () => {
    expect(safeFontFamily(`"Inter", system-ui, sans-serif`)).toBe(`"Inter", system-ui, sans-serif`);
    expect(safeFontFamily("Inter; } body { display:none")).toBe("");
    expect(safeFontFamily("url(https://evil.example/font.woff)")).toBe("");
    expect(safeFontFamily("var(--font)")).toBe("");
  });

  it("always picks readable button text and fixes low-contrast text", () => {
    for (const bg of ["#1a73e8", "#ffcc00", "#22c55e", "#777777", "#000000", "#ffffff", "#e11d48"]) {
      expect(contrast(readableOn(bg), bg)).toBeGreaterThanOrEqual(4.5);
    }
    const fixed = ensureContrast("#999999", "#ffffff");
    expect(contrast(fixed, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(ensureContrast("#111111", "#ffffff")).toBe("#111111");
  });
});
