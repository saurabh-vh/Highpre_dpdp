import { describe, expect, it } from "vitest";
import { can } from "@/lib/auth/permissions";
import { orgChecklist, readinessScore, siteChecklist } from "@/lib/compliance/checklist";
import { isTracking } from "@/lib/constants";
import { consentHash, ledgerDigest, type HashableConsent } from "@/lib/consent/hash";
import { PdfWriter, pdfSafe } from "@/lib/evidence/pdf";
import { rateLimitMemory } from "@/lib/rate-limit";
import { parentalSubmitSchema, purposeSchema } from "@/lib/validation";

describe("consent hash", () => {
  const record: HashableConsent = {
    siteId: "64b000000000000000000001",
    principalId: "abcdefghijklmnop1234",
    action: "grant",
    noticeVersion: 2,
    decisions: [{ purpose: "analytics", granted: true }],
    language: "hi",
    createdAt: new Date("2026-03-01T10:00:00Z"),
  };

  it("is stable for the same content", () => {
    expect(consentHash(record)).toBe(consentHash({ ...record, decisions: [{ purpose: "analytics", granted: true }] }));
  });

  it("changes when any evidence field changes", () => {
    const base = consentHash(record);
    expect(consentHash({ ...record, decisions: [{ purpose: "analytics", granted: false }] })).not.toBe(base);
    expect(consentHash({ ...record, noticeVersion: 3 })).not.toBe(base);
    expect(consentHash({ ...record, createdAt: new Date("2026-03-01T10:00:01Z") })).not.toBe(base);
    expect(consentHash({ ...record, ageGroup: "child" })).not.toBe(base);
  });

  it("digests a ledger in order", () => {
    expect(ledgerDigest(["a", "b"])).not.toBe(ledgerDigest(["b", "a"]));
    expect(ledgerDigest([])).toHaveLength(64);
  });
});

describe("permissions", () => {
  it("keeps billing with owners and team management with admins", () => {
    expect(can("owner", "billing")).toBe(true);
    expect(can("admin", "billing")).toBe(false);
    expect(can("admin", "team")).toBe(true);
    expect(can("member", "team")).toBe(false);
    expect(can("member", "requests")).toBe(true);
    expect(can("member", "notice.publish")).toBe(false);
    expect(can(undefined, "requests")).toBe(false);
  });
});

describe("checklist", () => {
  it("scores a half-done site at 50", () => {
    const items = siteChecklist({ id: "s", name: "S", purposes: [{}], publishedNoticeVersion: 0, lastScanId: "x" });
    expect(readinessScore(items)).toBe(50);
  });

  it("adds live obligations only while outstanding", () => {
    expect(orgChecklist({}, { overdueRequests: 2 }).map((i) => i.id)).toContain("overdue");
    expect(orgChecklist({}, {}).map((i) => i.id)).toEqual(["grievance"]);
  });
});

describe("rateLimitMemory", () => {
  it("allows up to the limit within a window, then resets", () => {
    const t = 1_000_000;
    expect(rateLimitMemory("k", 2, 1000, t).allowed).toBe(true);
    expect(rateLimitMemory("k", 2, 1000, t + 1).allowed).toBe(true);
    const blocked = rateLimitMemory("k", 2, 1000, t + 2);
    expect(blocked).toEqual({ allowed: false, retryAfter: 1 });
    expect(rateLimitMemory("k", 2, 1000, t + 1001).allowed).toBe(true);
  });
});

describe("validation", () => {
  it("requires the parental declaration", () => {
    const base = { siteKey: "abcdefgh12", principalId: "abcdefghijklmnop1234", email: "p@x.in", code: "123456", parentName: "Ravi", relationship: "parent" };
    expect(parentalSubmitSchema.safeParse({ ...base, declaration: false }).success).toBe(false);
    expect(parentalSubmitSchema.safeParse({ ...base, declaration: true }).success).toBe(true);
  });

  it("validates purpose keys and translations", () => {
    const p = { key: "Bad Key", name: "Calls", description: "Calling people back.", dataCategories: ["phone"], essential: false, tracking: false, retentionDays: 30 };
    expect(purposeSchema.safeParse(p).success).toBe(false);
    expect(purposeSchema.safeParse({ ...p, key: "calls", translations: [{ lang: "ta", name: "அழைப்பு", description: "" }] }).success).toBe(true);
    expect(purposeSchema.safeParse({ ...p, key: "calls", translations: [{ lang: "xx", name: "n", description: "" }] }).success).toBe(false);
  });

  it("treats legacy analytics and marketing purposes as tracking", () => {
    expect(isTracking({ key: "analytics" })).toBe(true);
    expect(isTracking({ key: "marketing", tracking: null })).toBe(true);
    expect(isTracking({ key: "analytics", tracking: false })).toBe(false);
    expect(isTracking({ key: "custom" })).toBe(false);
  });
});

describe("PDF writer", () => {
  it("reduces text to the standard font's character set", () => {
    expect(pdfSafe("Notice — ₹999 “quoted” हिंदी")).toBe('Notice - Rs. 999 "quoted" ?????');
  });

  it("writes a multi-page PDF", async () => {
    const pdf = await PdfWriter.create("Test");
    pdf.title("Evidence", "Acme");
    pdf.table([{ header: "A", width: 0.5 }, { header: "B", width: 0.5 }], Array.from({ length: 120 }, (_, i) => [`row ${i}`, "x".repeat(200)]));
    const bytes = await pdf.finish("Footer");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.doc.getPageCount()).toBeGreaterThan(1);
  });
});
