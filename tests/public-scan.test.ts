import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKETING_CONSENT, marketingConsentRecord, scanLeadSchema } from "@/lib/public-scan/lead";
import { buildScanReportPdf } from "@/lib/public-scan/pdf";
import { REPORT_TTL_SECONDS, isReportExpired, isReportId, newReportId, reportExpiresAt } from "@/lib/public-scan/report";

describe("public scan report ids", () => {
  it("are random, URL-safe and at least 16 characters", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newReportId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id.length).toBeGreaterThanOrEqual(16);
      expect(isReportId(id)).toBe(true);
    }
    expect(isReportId("short")).toBe(false);
    expect(isReportId("has spaces in it here")).toBe(false);
    expect(isReportId({ $gt: "" })).toBe(false);
  });

  it("expire 30 days after creation", () => {
    const created = new Date("2026-10-01T00:00:00Z");
    expect(REPORT_TTL_SECONDS).toBe(30 * 86_400);
    expect(reportExpiresAt(created).toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(isReportExpired(created, new Date("2026-10-30T23:59:59Z"))).toBe(false);
    expect(isReportExpired(created, new Date("2026-10-31T00:00:00Z"))).toBe(true);
  });

  it("are removed by a TTL index on the model", async () => {
    const { PublicScanReport } = await import("@/models");
    const ttl = PublicScanReport.schema.indexes().find(([fields]) => "createdAt" in fields);
    expect(ttl?.[1]).toMatchObject({ expireAfterSeconds: REPORT_TTL_SECONDS });
  });
});

describe("scan lead validation", () => {
  const reportId = newReportId();

  it("requires a valid email and normalises it", () => {
    expect(scanLeadSchema.safeParse({ reportId, email: "not-an-email" }).success).toBe(false);
    const parsed = scanLeadSchema.parse({ reportId, email: "  Owner@Acme.IN " });
    expect(parsed.email).toBe("owner@acme.in");
  });

  it("treats marketing consent as off unless explicitly ticked", () => {
    expect(scanLeadSchema.parse({ reportId, email: "a@b.in" }).marketing).toBe(false);
    expect(scanLeadSchema.parse({ reportId, email: "a@b.in", marketing: false }).marketing).toBe(false);
    expect(scanLeadSchema.parse({ reportId, email: "a@b.in", marketing: "yes please" }).marketing).toBe(false);
    expect(scanLeadSchema.parse({ reportId, email: "a@b.in", marketing: true }).marketing).toBe(true);
    expect(scanLeadSchema.parse({ reportId, email: "a@b.in", marketing: "on" }).marketing).toBe(true);
  });

  it("rejects malformed report ids", () => {
    expect(scanLeadSchema.safeParse({ reportId: "../../x", email: "a@b.in" }).success).toBe(false);
  });

  it("records the choice with timestamp, purpose and the wording shown", () => {
    const at = new Date("2026-10-09T08:00:00Z");
    expect(marketingConsentRecord(false, at)).toEqual({ granted: false, at, purpose: "product_updates", noticeVersion: MARKETING_CONSENT.version, text: MARKETING_CONSENT.text });
  });
});

const report = {
  url: "https://acme.in/",
  score: 40,
  createdAt: new Date("2026-10-09T08:00:00Z"),
  pagesScanned: ["https://acme.in/", "https://acme.in/contact"],
  trackers: [{ name: "Meta Pixel", category: "marketing" }],
  forms: [{ page: "https://acme.in/contact", fields: ["Email", "Name", "Phone"] }],
  findings: [
    { id: "trackers_without_consent", severity: "critical", title: "1 tracker loads without asking", detail: "Meta Pixel runs before visitors agree." },
    { id: "new_security_check", severity: "warning", title: "Missing security header — HSTS", detail: "Add Strict-Transport-Security." },
    { id: "https", severity: "pass", title: "Served over HTTPS", detail: "Data in transit is encrypted." },
  ],
  appUrl: "https://app.example.in",
  reportUrl: "https://app.example.in/scan/r/abcdefghijklmnop",
};

describe("scan report PDF", () => {
  it("builds a non-empty PDF", async () => {
    const bytes = await buildScanReportPdf(report);
    expect(bytes.byteLength).toBeGreaterThan(1500);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("copes with no findings, trackers or forms", async () => {
    const bytes = await buildScanReportPdf({ ...report, score: 100, trackers: [], forms: [], findings: [] });
    expect(Buffer.from(bytes.subarray(0, 4)).toString("latin1")).toBe("%PDF");
  });
});

describe("mail attachments in development", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs the attachment name and size instead of sending", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendMail } = await import("@/lib/mail/mailer");
    const { scanReportEmail } = await import("@/lib/mail/templates");
    const pdf = new Uint8Array([37, 80, 68, 70, 45, 49]);
    const mail = scanReportEmail({ to: "owner@acme.in", site: "acme.in", score: 40, reportUrl: report.reportUrl, signupUrl: "https://app.example.in/register", pdf, filename: "highpre-scan-acme.in.pdf" });
    expect(mail.attachments?.[0]).toMatchObject({ filename: "highpre-scan-acme.in.pdf", contentType: "application/pdf" });

    await sendMail(mail);
    const output = info.mock.calls.map((c) => String(c[0])).join("\n");
    expect(output).toContain("[mail:dev] Attachment: highpre-scan-acme.in.pdf (6 bytes)");
    expect(output).not.toContain("%PDF");
  });
});
