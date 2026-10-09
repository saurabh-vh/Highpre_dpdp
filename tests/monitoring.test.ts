import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanResult } from "@/lib/scanner";

/**
 * Weekly monitoring against an in-memory MongoDB: which sites are due for a
 * rescan, change alerts and their once-a-day throttle. The network scan,
 * favicon and brand fetches and email are stubbed.
 */
vi.mock("@/lib/scanner/index", async (importOriginal) => ({ ...(await importOriginal<object>()), scanWebsite: vi.fn() }));
vi.mock("@/lib/scanner/safe-fetch", async (importOriginal) => ({ ...(await importOriginal<object>()), safeFetchImage: vi.fn(async () => null) }));
vi.mock("@/lib/scanner/brand", () => ({ fetchBrand: vi.fn(async () => Promise.reject(new Error("offline"))) }));
vi.mock("@/lib/mail/mailer", () => ({ sendMail: vi.fn(async () => undefined) }));

let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("highpre-monitoring-test");
  const { connectDb } = await import("@/lib/db");
  await connectDb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

const DAY = 86_400_000;

async function setup() {
  const { Organization, Site, User } = await import("@/models");
  const stamp = `${Date.now()}${Math.random()}`;
  const [owner, admin, member] = await Promise.all(
    ["owner", "admin", "member"].map((r) => User.create({ name: r, email: `${r}${stamp}@x.in`, passwordHash: "x" })),
  );
  const org = await Organization.create({
    name: "Monitor Org",
    members: [
      { userId: owner._id, role: "owner" },
      { userId: admin._id, role: "admin" },
      { userId: member._id, role: "member" },
    ],
  });
  const site = (name: string, monitoring?: { enabled: boolean }) =>
    Site.create({ orgId: org._id, name, url: `https://${name.toLowerCase()}.example.in`, siteKey: `${name}${stamp}`, ...(monitoring ? { monitoring } : {}) });
  return { org, owner, admin, member, site };
}

/** Inserts a scan with a chosen age (bypassing timestamps). */
async function pastScan(siteId: Types.ObjectId, ageDays: number, extra: Record<string, unknown> = {}) {
  const { Scan } = await import("@/models");
  const at = new Date(Date.now() - ageDays * DAY);
  await Scan.collection.insertOne({ siteId, url: "https://shop.example.in/", status: "complete", score: 90, trackers: [], findings: [{ id: "notice" }, { id: "grievance" }, { id: "https" }], createdAt: at, updatedAt: at, ...extra });
}

const result = (over: Partial<ScanResult> = {}): ScanResult => ({
  url: "https://shop.example.in/",
  score: 90,
  pagesScanned: ["https://shop.example.in/"],
  forms: [],
  trackers: [],
  cookies: [],
  privacyNoticeUrl: "https://shop.example.in/privacy",
  consentTool: "HighPre",
  faviconUrl: "https://shop.example.in/favicon.ico",
  security: { headers: { missing: [], present: [] }, mixedContent: { count: 0, examples: [] }, insecureForms: [], insecureCookies: [] },
  findings: [
    { id: "notice", severity: "pass", title: "Privacy notice linked", detail: "" },
    { id: "grievance", severity: "pass", title: "Grievance contact mentioned", detail: "" },
    { id: "https", severity: "pass", title: "Served over HTTPS", detail: "" },
  ],
  ...over,
});

beforeEach(async () => {
  const { Scan, Site } = await import("@/models");
  await Promise.all([Scan.deleteMany({}), Site.deleteMany({})]);
  vi.clearAllMocks();
});

describe("dueSites", () => {
  it("picks monitored sites never scanned or scanned over a week ago, oldest first, up to the limit", async () => {
    const { dueSites } = await import("@/lib/scanner/monitor");
    const { site } = await setup();
    const never = await site("Never");
    const old = await site("Old");
    const failedOld = await site("FailedOld");
    const fresh = await site("Fresh");
    const off = await site("Off", { enabled: false });
    const extra = await site("Extra");
    await pastScan(old._id, 10);
    await pastScan(failedOld._id, 8, { status: "failed" });
    await pastScan(fresh._id, 30);
    await pastScan(fresh._id, 2); // the latest scan counts, not the oldest
    await pastScan(extra._id, 7.5);
    void off;

    const due = await dueSites(new Date(), 3);
    expect(due.map((s) => s.name)).toEqual(["Never", "Old", "FailedOld"]);
    expect(String(due[0]._id)).toBe(String(never._id));
    expect((await dueSites(new Date(), 10)).map((s) => s.name)).toEqual(["Never", "Old", "FailedOld", "Extra"]);
  });
});

describe("runScheduledScans", () => {
  it("rescans, stores changes, emails owners and admins once per day and logs it", async () => {
    const { runScheduledScans, alertSiteChanges } = await import("@/lib/scanner/monitor");
    const { scanWebsite } = await import("@/lib/scanner/index");
    const { sendMail } = await import("@/lib/mail/mailer");
    const { AuditLog, Scan, Site } = await import("@/models");
    const { owner, admin, site } = await setup();
    const shop = await site("Shop");
    await pastScan(shop._id, 8, { consentTool: "HighPre", privacyNoticeUrl: "https://shop.example.in/privacy" });

    // The banner disappeared and a tracker arrived.
    vi.mocked(scanWebsite).mockResolvedValueOnce(result({ consentTool: undefined, trackers: [{ id: "meta_pixel", name: "Meta Pixel", category: "marketing" }] }));
    expect(await runScheduledScans()).toEqual({ sitesRescanned: 1, rescanFailures: 0, changeAlerts: 1 });

    const latest = await Scan.findOne({ siteId: shop._id }).sort({ createdAt: -1 }).lean();
    expect(latest?.trigger).toBe("scheduled");
    expect(latest?.changes.map((c) => c.kind)).toEqual(["consent_tool_lost", "trackers_added"]);
    expect(vi.mocked(sendMail).mock.calls.map(([m]) => m.to).sort()).toEqual([owner.email, admin.email].sort());
    expect(vi.mocked(sendMail).mock.calls[0][0].text).toContain("Meta Pixel");
    expect(vi.mocked(sendMail).mock.calls[0][0].text).toContain(`/dashboard/sites/${shop._id}`);
    expect((await Site.findById(shop._id).lean())?.monitoring?.lastAlertAt).toBeInstanceOf(Date);
    expect(await AuditLog.countDocuments({ siteId: shop._id, action: "site.monitoring_alert" })).toBe(1);
    expect((await Site.findById(shop._id).lean())?.lastScanId).toBeDefined();

    // A week later something else changes, but an alert went out less than 24 hours ago (as far as the throttle knows).
    await Scan.collection.updateMany({ siteId: shop._id }, { $set: { createdAt: new Date(Date.now() - 8 * DAY) } });
    vi.mocked(sendMail).mockClear();
    vi.mocked(scanWebsite).mockResolvedValueOnce(result({ consentTool: undefined, trackers: [{ id: "meta_pixel", name: "Meta Pixel", category: "marketing" }, { id: "hotjar", name: "Hotjar", category: "session_recording" }] }));
    expect(await runScheduledScans()).toEqual({ sitesRescanned: 1, rescanFailures: 0, changeAlerts: 0 });
    expect(sendMail).not.toHaveBeenCalled();

    // A day later the throttle has lapsed.
    const tomorrow = new Date(Date.now() + 25 * 3_600_000);
    const target = { _id: shop._id, orgId: shop.orgId, name: shop.name, url: shop.url };
    expect(await alertSiteChanges(target, [{ kind: "https_lost", severity: "critical", message: "HTTPS lost." }], tomorrow)).toBe(true);
    // Information-only changes never alert.
    expect(await alertSiteChanges(target, [{ kind: "trackers_removed", severity: "info", message: "Gone." }], new Date(tomorrow.getTime() + 2 * DAY))).toBe(false);
  });

  it("stores a failed scan and moves on when the website can't be reached", async () => {
    const { runScheduledScans } = await import("@/lib/scanner/monitor");
    const { scanWebsite, ScanFetchError } = await import("@/lib/scanner/index");
    const { sendMail } = await import("@/lib/mail/mailer");
    const { Scan } = await import("@/models");
    const { site } = await setup();
    const down = await site("Down");
    vi.mocked(scanWebsite).mockRejectedValueOnce(new ScanFetchError("Couldn't reach down.example.in."));

    expect(await runScheduledScans()).toEqual({ sitesRescanned: 0, rescanFailures: 1, changeAlerts: 0 });
    expect(await Scan.findOne({ siteId: down._id }).lean()).toMatchObject({ status: "failed", trigger: "scheduled", error: "Couldn't reach down.example.in." });
    expect(sendMail).not.toHaveBeenCalled();
  });
});
