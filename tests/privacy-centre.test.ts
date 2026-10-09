import { describe, expect, it } from "vitest";
import { BADGE_LABEL, badgeSvg, isSiteKey, parseBadgeOptions } from "@/lib/privacy-centre/badge";
import { buildPrivacyCentre, isPrivacyCentreAvailable, shapeCookies, shapeTrackers, shapeVendors } from "@/lib/privacy-centre/shape";

const siteId = "65f0c0ffee0000000000000a";

const site = {
  _id: siteId,
  name: "Acme Store",
  url: "https://www.acme.in/",
  publishedNoticeVersion: 3,
  children: { enabled: true },
  privacyCentre: { enabled: true, showVendors: false },
  purposes: [
    { key: "essential", name: "Essential website features", description: "Keeps the site working.", essential: true },
    { key: "analytics", name: "Analytics", description: "Understand how visitors use the site.", translations: [{ lang: "hi", name: "विश्लेषण", description: "साइट के उपयोग को समझना।" }] },
  ],
};

const org = { name: "Acme", legalName: "Acme Retail Pvt Ltd", grievanceOfficerName: "Asha Rao", grievanceEmail: "privacy@acme.in", grievancePhone: "", responseDays: 15 };

const notice = {
  version: 3,
  createdAt: new Date("2026-09-01T10:00:00Z"),
  content: { en: { title: "Privacy notice — Acme Store", intro: "We explain..." }, hi: { title: "गोपनीयता सूचना", intro: "..." } },
};

const scan = {
  createdAt: new Date("2026-10-01T10:00:00Z"),
  consentTool: "HighPre",
  trackers: [
    { id: "meta_pixel", name: "Meta Pixel", category: "marketing" },
    { id: "ga4", name: "Google Analytics", category: "analytics" },
    { id: "ga4", name: "Google Analytics", category: "analytics" },
    { id: "tawk", name: "Tawk.to", category: "support" },
  ],
  cookies: ["PHPSESSID", "_ga", " ", "_ga"],
};

describe("privacy centre availability", () => {
  it("needs a published notice and is on by default", () => {
    expect(isPrivacyCentreAvailable({ publishedNoticeVersion: 0 })).toBe(false);
    expect(isPrivacyCentreAvailable({ publishedNoticeVersion: 1 })).toBe(true);
    expect(isPrivacyCentreAvailable({ publishedNoticeVersion: 1, privacyCentre: {} })).toBe(true);
    expect(isPrivacyCentreAvailable({ publishedNoticeVersion: 1, privacyCentre: { enabled: false } })).toBe(false);
  });
});

describe("shapeTrackers", () => {
  it("dedupes, sorts, adds category and purpose, and marks consent gating", () => {
    const trackers = shapeTrackers(scan);
    expect(trackers.map((t) => t.name)).toEqual(["Google Analytics", "Meta Pixel", "Tawk.to"]);
    expect(trackers[0]).toMatchObject({ category: "Analytics", waitsForConsent: true });
    expect(trackers[0].purpose).toMatch(/how visitors use/);
  });

  it("says trackers may load before a choice when no consent tool was found", () => {
    const trackers = shapeTrackers({ ...scan, consentTool: null });
    expect(trackers.find((t) => t.name === "Meta Pixel")?.waitsForConsent).toBe(false);
    // Support chat is part of the service visitors ask for.
    expect(trackers.find((t) => t.name === "Tawk.to")?.waitsForConsent).toBe(true);
  });

  it("returns nothing without a scan", () => {
    expect(shapeTrackers(null)).toEqual([]);
  });
});

describe("shapeCookies", () => {
  it("dedupes names and recognises common essential cookies", () => {
    const cookies = shapeCookies(scan);
    expect(cookies).toHaveLength(2);
    expect(cookies).toEqual(expect.arrayContaining([{ name: "PHPSESSID", essential: true }, { name: "_ga", essential: false }]));
  });
});

describe("shapeVendors", () => {
  it("lists active vendors for this site plus organisation-wide manual ones", () => {
    const vendors = shapeVendors(
      [
        { name: "Hotjar", category: "session_recording", source: "scan", siteIds: [siteId], processingCountry: "Malta" },
        { name: "Old pixel", category: "marketing", source: "scan", siteIds: [] },
        { name: "Other site tool", category: "analytics", source: "scan", siteIds: ["65f0c0ffee0000000000000b"] },
        { name: "Razorpay", category: "payments", source: "manual", siteIds: [], processingCountry: " India " },
        { name: "Archived CRM", category: "crm", source: "manual", siteIds: [], archivedAt: new Date() },
      ],
      siteId,
    );
    expect(vendors).toEqual([
      { name: "Hotjar", category: "Session recording", country: "Malta" },
      { name: "Razorpay", category: "Payments", country: "India" },
    ]);
  });
});

describe("buildPrivacyCentre", () => {
  it("shapes the page in the visitor's language and hides vendors unless allowed", () => {
    const view = buildPrivacyCentre({ site, org, notice, languages: ["en", "hi"], lang: "hi", scan, vendors: [{ name: "Hotjar", source: "scan", siteIds: [siteId] }] });
    expect(view.businessName).toBe("Acme Retail Pvt Ltd");
    expect(view.siteHost).toBe("acme.in");
    expect(view.notice).toMatchObject({ version: 3, title: "गोपनीयता सूचना", languages: ["en", "hi"] });
    expect(view.purposes[1]).toEqual({ key: "analytics", name: "विश्लेषण", description: "साइट के उपयोग को समझना।", essential: false });
    expect(view.purposes[0].essential).toBe(true);
    expect(view.contact).toEqual({ officer: "Asha Rao", email: "privacy@acme.in", phone: "", responseDays: 15 });
    expect(view.parentalConsent).toBe(true);
    expect(view.reopenButton).toBe(true);
    expect(view.vendors).toBeNull();
    expect(view.lastCheckedAt).toEqual(scan.createdAt);
  });

  it("includes vendors when the setting is on and copes with no scan or contact", () => {
    const view = buildPrivacyCentre({
      site: { ...site, privacyCentre: { showVendors: true }, banner: { showReopenButton: false } },
      org: { name: "Acme" },
      notice,
      languages: ["en"],
      lang: "en",
      scan: null,
      vendors: [{ name: "Hotjar", category: "session_recording", source: "scan", siteIds: [siteId] }],
    });
    expect(view.businessName).toBe("Acme");
    expect(view.contact).toBeNull();
    expect(view.vendors).toHaveLength(1);
    expect(view.trackers).toEqual([]);
    expect(view.lastCheckedAt).toBeNull();
    expect(view.reopenButton).toBe(false);
  });
});

describe("privacy badge", () => {
  it("renders light and dark variants in two sizes without claiming certification", () => {
    const light = badgeSvg();
    const dark = badgeSvg({ theme: "dark", size: "small" });
    expect(light).toMatch(/^<svg /);
    expect(light).toContain(`aria-label="${BADGE_LABEL}"`);
    expect(light).toContain('width="196"');
    expect(dark).toContain('width="147"');
    expect(dark).toContain("#000000");
    expect(light).not.toMatch(/certif|compliant|verified/i);
    expect(light).not.toMatch(/<script|href=/i);
  });

  it("parses options and validates site keys", () => {
    expect(parseBadgeOptions(new URLSearchParams("theme=dark&size=small"))).toEqual({ theme: "dark", size: "small" });
    expect(parseBadgeOptions(new URLSearchParams("theme=neon"))).toEqual({ theme: "light", size: "regular" });
    expect(isSiteKey("abcDEF123_-xyz12")).toBe(true);
    expect(isSiteKey("../etc")).toBe(false);
  });

  it("is served as a cacheable, cross-origin embeddable SVG", async () => {
    const { GET } = await import("@/app/p/[siteKey]/badge.svg/route");
    const res = await GET(new Request("https://app.example.in/p/abcDEF123_-xyz12/badge.svg?theme=dark"), { params: Promise.resolve({ siteKey: "abcDEF123_-xyz12" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = await res.text();
    expect(body).toContain("Privacy centre");
    expect(body).toContain("#000000");

    const bad = await GET(new Request("https://app.example.in/p/x/badge.svg"), { params: Promise.resolve({ siteKey: "x" }) });
    expect(bad.status).toBe(404);
  });
});
