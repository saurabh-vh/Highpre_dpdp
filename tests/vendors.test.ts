import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { orgChecklist, vendorChecklistItem } from "@/lib/compliance/checklist";
import { vendorSchema } from "@/lib/validation";
import { vendorsFromScan } from "@/lib/vendors/sync";

/** The vendor register: detecting vendors in scans, syncing them, and the DPA checklist item. */
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("highpre-vendors-test");
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  const { Vendor } = await import("@/models");
  await Vendor.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

const ga = { id: "ga4", name: "Google Analytics", category: "analytics" };
const meta = { id: "meta_pixel", name: "Meta Pixel", category: "marketing" };
const tawk = { id: "tawk", name: "Tawk.to", category: "support" };

describe("vendorsFromScan", () => {
  it("maps trackers and third-party consent tools, skipping HighPre itself", () => {
    expect(vendorsFromScan({ trackers: [ga, tawk], consentTool: "CookieYes" })).toEqual([
      { key: "ga4", name: "Google Analytics", category: "analytics" },
      { key: "tawk", name: "Tawk.to", category: "support" },
      { key: "consent_cookieyes", name: "CookieYes", category: "consent" },
    ]);
    expect(vendorsFromScan({ trackers: [], consentTool: "HighPre" })).toEqual([]);
    expect(vendorsFromScan({ trackers: [{ id: "x", name: "X", category: "unknown" }] })[0].category).toBe("other");
  });
});

describe("syncVendorsFromScan", () => {
  it("creates once per signature, then updates dates and sites without duplicating", async () => {
    const { syncVendorsFromScan } = await import("@/lib/vendors/sync");
    const { Vendor } = await import("@/models");
    const orgId = new Types.ObjectId();
    const siteA = new Types.ObjectId();
    const siteB = new Types.ObjectId();
    const t1 = new Date("2026-01-01T00:00:00Z");
    const t2 = new Date("2026-02-01T00:00:00Z");

    expect(await syncVendorsFromScan(orgId, siteA, { createdAt: t1, trackers: [ga, meta] })).toEqual({ created: 2, updated: 0 });
    expect(await syncVendorsFromScan(orgId, siteA, { createdAt: t2, trackers: [ga, meta] })).toEqual({ created: 0, updated: 2 });
    expect(await syncVendorsFromScan(orgId, siteB, { createdAt: t2, trackers: [ga] })).toEqual({ created: 0, updated: 1 });

    const vendors = await Vendor.find({ orgId }).sort({ signatureKey: 1 }).lean();
    expect(vendors).toHaveLength(2);
    const gaVendor = vendors.find((v) => v.signatureKey === "ga4")!;
    expect(gaVendor).toMatchObject({ name: "Google Analytics", category: "analytics", source: "scan", dpaStatus: "not_started" });
    expect(gaVendor.firstDetectedAt?.getTime()).toBe(t1.getTime());
    expect(gaVendor.lastDetectedAt?.getTime()).toBe(t2.getTime());
    expect(gaVendor.siteIds.map(String).sort()).toEqual([siteA, siteB].map(String).sort());
    expect(gaVendor.dataShared).not.toBe("");

    // Another organisation's scan never touches these records.
    await syncVendorsFromScan(new Types.ObjectId(), siteA, { createdAt: t2, trackers: [ga] });
    expect(await Vendor.countDocuments({ orgId })).toBe(2);
  });

  it("keeps the user's edits and drops sites whose latest scan no longer finds the vendor", async () => {
    const { syncVendorsFromScan } = await import("@/lib/vendors/sync");
    const { Vendor } = await import("@/models");
    const orgId = new Types.ObjectId();
    const site = new Types.ObjectId();
    await syncVendorsFromScan(orgId, site, { trackers: [ga, meta] });
    await Vendor.updateOne({ orgId, signatureKey: "ga4" }, { name: "GA (main property)", dpaStatus: "signed", processingCountry: "United States" });

    await syncVendorsFromScan(orgId, site, { trackers: [ga] });
    const gaVendor = await Vendor.findOne({ orgId, signatureKey: "ga4" }).lean();
    expect(gaVendor).toMatchObject({ name: "GA (main property)", dpaStatus: "signed", processingCountry: "United States" });
    expect((await Vendor.findOne({ orgId, signatureKey: "meta_pixel" }).lean())?.siteIds).toEqual([]);
  });

  it("brings back an archived vendor only when a later scan finds it", async () => {
    const { syncVendorsFromScan } = await import("@/lib/vendors/sync");
    const { Vendor } = await import("@/models");
    const orgId = new Types.ObjectId();
    const site = new Types.ObjectId();
    await syncVendorsFromScan(orgId, site, { createdAt: new Date("2026-01-01"), trackers: [tawk] });
    await Vendor.updateOne({ orgId, signatureKey: "tawk" }, { archivedAt: new Date("2026-03-01") });

    await syncVendorsFromScan(orgId, site, { createdAt: new Date("2026-02-01"), trackers: [tawk] });
    expect((await Vendor.findOne({ orgId, signatureKey: "tawk" }).lean())?.archivedAt).toBeTruthy();

    await syncVendorsFromScan(orgId, site, { createdAt: new Date("2026-04-01"), trackers: [tawk] });
    expect((await Vendor.findOne({ orgId, signatureKey: "tawk" }).lean())?.archivedAt).toBeUndefined();
  });

  it("allows many manual vendors (no signature) alongside detected ones", async () => {
    const { Vendor } = await import("@/models");
    const orgId = new Types.ObjectId();
    await Vendor.create({ orgId, name: "Razorpay", category: "payments", source: "manual" });
    await Vendor.create({ orgId, name: "Zoho Mail", category: "email", source: "manual" });
    expect(await Vendor.countDocuments({ orgId })).toBe(2);
    await Vendor.create({ orgId, name: "Hotjar", source: "scan", signatureKey: "hotjar" });
    await expect(Vendor.create({ orgId, name: "Hotjar again", source: "scan", signatureKey: "hotjar" })).rejects.toThrow(/duplicate key/);
  });
});

describe("syncVendorsFromLatestScans and vendorCoverage", () => {
  it("replays each site's latest complete scan and reports DPA coverage", async () => {
    const { syncVendorsFromLatestScans, vendorCoverage } = await import("@/lib/vendors/sync");
    const { Scan, Site, Vendor } = await import("@/models");
    const orgId = new Types.ObjectId();
    expect(await vendorCoverage(orgId)).toEqual({ active: 0, missingDpa: 0, scanned: false });

    const site = await Site.create({ orgId, name: "Shop", url: "https://shop.example.in", siteKey: `k${Date.now()}` });
    await Scan.create({ siteId: site._id, url: site.url, status: "complete", trackers: [ga], createdAt: new Date("2026-01-01") });
    const latest = await Scan.create({ siteId: site._id, url: site.url, status: "complete", trackers: [ga, tawk], consentTool: "HighPre" });
    await Scan.create({ siteId: site._id, url: site.url, status: "failed", error: "Timed out" });
    await Site.updateOne({ _id: site._id }, { lastScanId: latest._id });

    expect(await syncVendorsFromLatestScans(orgId)).toEqual({ created: 2, updated: 0, sites: 1 });
    expect(await syncVendorsFromLatestScans(orgId)).toEqual({ created: 0, updated: 2, sites: 1 });
    expect(await vendorCoverage(orgId)).toEqual({ active: 2, missingDpa: 2, scanned: true });

    await Vendor.updateOne({ orgId, signatureKey: "ga4" }, { dpaStatus: "signed", dpaSignedAt: new Date() });
    await Vendor.updateOne({ orgId, signatureKey: "tawk" }, { archivedAt: new Date() });
    expect(await vendorCoverage(orgId)).toEqual({ active: 1, missingDpa: 0, scanned: true });
  });
});

describe("DPA checklist item", () => {
  it("is done only when every active vendor is covered and there's something to check", () => {
    expect(vendorChecklistItem({ active: 0, missingDpa: 0, scanned: false }).done).toBe(false);
    expect(vendorChecklistItem({ active: 0, missingDpa: 0, scanned: true }).done).toBe(true);
    expect(vendorChecklistItem({ active: 3, missingDpa: 0, scanned: false }).done).toBe(true);
    const missing = vendorChecklistItem({ active: 3, missingDpa: 2, scanned: true });
    expect(missing.done).toBe(false);
    expect(missing.hint).toMatch(/2 vendors/);
  });

  it("appears in the organisation checklist only when vendor data is supplied", () => {
    const org = { grievanceEmail: "dpo@x.in", grievanceOfficerName: "A" };
    expect(orgChecklist(org).some((i) => i.id === "vendors")).toBe(false);
    expect(orgChecklist(org, { vendors: { active: 1, missingDpa: 1, scanned: true } }).find((i) => i.id === "vendors")?.done).toBe(false);
  });
});

describe("vendorSchema", () => {
  const base = { name: "Razorpay", category: "payments", dpaStatus: "signed", dpaSignedAt: "2026-01-15" };

  it("parses dates to noon UTC and normalises the website", () => {
    const parsed = vendorSchema.parse({ ...base, website: "razorpay.com", dpaRenewalAt: "" });
    expect(parsed.dpaSignedAt?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    expect(parsed.dpaRenewalAt).toBeUndefined();
    expect(parsed.website).toBe("https://razorpay.com");
  });

  it("requires a signing date for signed agreements and a renewal after it", () => {
    expect(vendorSchema.safeParse({ ...base, dpaSignedAt: "" }).error?.flatten().fieldErrors.dpaSignedAt).toBeDefined();
    expect(vendorSchema.safeParse({ ...base, dpaRenewalAt: "2025-12-01" }).error?.flatten().fieldErrors.dpaRenewalAt).toBeDefined();
    expect(vendorSchema.safeParse({ ...base, dpaStatus: "not_started", dpaSignedAt: "" }).success).toBe(true);
  });
});
