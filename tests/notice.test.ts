import { describe, expect, it } from "vitest";
import { LANG_CODES } from "@/lib/i18n";
import { generateNotice, retentionText, type NoticeInput } from "@/lib/notice/generate";
import { publishableLanguages } from "@/lib/notice/input";

const input: NoticeInput = {
  businessName: "Acme Clinics Pvt Ltd",
  siteName: "Acme",
  grievanceOfficerName: "Asha",
  grievanceEmail: "privacy@acme.in",
  responseDays: 30,
  rightsUrl: "https://app.example.in/p/key/rights",
  version: 3,
  effectiveDate: new Date("2026-01-15T00:00:00Z"),
  purposes: [
    { key: "enquiries", name: "Responding to your enquiries", description: "Using the details you share in our forms to call, email or message you back about your request.", dataCategories: ["name", "phone"], essential: false, retentionDays: 180 },
  ],
};

describe("generateNotice", () => {
  it("produces every requested language with the same sections", () => {
    const notice = generateNotice(input, LANG_CODES);
    for (const lang of LANG_CODES) {
      const c = notice[lang]!;
      expect(c.sections).toHaveLength(6);
      expect(c.title).toContain("Acme");
      expect(c.sections[0].body.startsWith("• ")).toBe(true);
      expect(c.sections.some((s) => s.body.includes(input.rightsUrl))).toBe(true);
      expect(c.sections.some((s) => s.body.includes("privacy@acme.in"))).toBe(true);
    }
  });

  it("adds the children section only when the age check is on", () => {
    expect(generateNotice({ ...input, children: true }, ["en"]).en!.sections.map((s) => s.heading)).toContain("Children");
    expect(generateNotice(input, ["en"]).en!.sections.map((s) => s.heading)).not.toContain("Children");
  });

  it("says when nothing is collected", () => {
    expect(generateNotice({ ...input, purposes: [] }, ["en"]).en!.sections[0].body).toMatch(/don't currently collect/);
  });
});

describe("retentionText", () => {
  it("uses years, months or days", () => {
    expect(retentionText(365, "en")).toBe("1 year");
    expect(retentionText(730, "en")).toBe("2 years");
    expect(retentionText(180, "en")).toBe("6 months");
    expect(retentionText(45, "en")).toBe("45 days");
  });
});

describe("publishableLanguages", () => {
  it("trims to the plan's allowance and reports what was left out", () => {
    expect(publishableLanguages(["en", "hi", "ta", "bn"], 2)).toEqual({ languages: ["en", "hi"], dropped: ["bn", "ta"] });
    expect(publishableLanguages(["en", "ta"], 8).dropped).toEqual([]);
  });
});
