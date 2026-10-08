import "server-only";
import { Types } from "mongoose";
import { Scan, Site, Vendor } from "@/models";
import { DEFAULT_DATA_SHARED, VENDOR_CATEGORY_VALUES, type VendorCategory } from "./constants";

export type DetectedVendor = { key: string; name: string; category: VendorCategory };

type ScanLike = {
  createdAt?: Date | null;
  trackers: { id?: string | null; name?: string | null; category?: string | null }[];
  consentTool?: string | null;
};

/** Consent tools that are part of HighPre itself, so not a third party. */
const FIRST_PARTY_TOOLS = new Set(["HighPre"]);

const asCategory = (c: string | null | undefined): VendorCategory => (VENDOR_CATEGORY_VALUES.includes(c as VendorCategory) ? (c as VendorCategory) : "other");

/** The third parties a scan found: every matched tracker signature, plus a third-party consent tool. */
export function vendorsFromScan(scan: ScanLike): DetectedVendor[] {
  const out = new Map<string, DetectedVendor>();
  for (const t of scan.trackers) {
    if (t.id && t.name) out.set(t.id, { key: t.id, name: t.name, category: asCategory(t.category) });
  }
  if (scan.consentTool && !FIRST_PARTY_TOOLS.has(scan.consentTool)) {
    const key = `consent_${scan.consentTool.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    out.set(key, { key, name: scan.consentTool, category: "consent" });
  }
  return [...out.values()];
}

/**
 * Upserts a vendor for each third party in one site's scan. Vendors are keyed
 * by signature, so repeat scans and other sites update the same record. The
 * site is dropped from scan-detected vendors its scan no longer finds, and a
 * vendor archived before this scan reappears if it's detected again.
 */
export async function syncVendorsFromScan(orgId: Types.ObjectId | string, siteId: Types.ObjectId | string, scan: ScanLike): Promise<{ created: number; updated: number }> {
  const at = scan.createdAt ?? new Date();
  const site = new Types.ObjectId(String(siteId));
  const detected = vendorsFromScan(scan);
  let created = 0;

  for (const v of detected) {
    const filter = { orgId, signatureKey: v.key };
    const result = await Vendor.updateOne(
      filter,
      {
        $setOnInsert: { name: v.name, category: v.category, source: "scan", dataShared: DEFAULT_DATA_SHARED[v.category] ?? "" },
        $min: { firstDetectedAt: at },
        $max: { lastDetectedAt: at },
        $addToSet: { siteIds: site },
      },
      { upsert: true },
    );
    created += result.upsertedCount;
    await Vendor.updateOne({ ...filter, archivedAt: { $lt: at } }, { $unset: { archivedAt: 1 } });
  }

  await Vendor.updateMany({ orgId, source: "scan", siteIds: site, signatureKey: { $nin: detected.map((v) => v.key) } }, { $pull: { siteIds: site } });
  return { created, updated: detected.length - created };
}

/** Replays each site's latest complete scan, for organisations that scanned before the register existed. */
export async function syncVendorsFromLatestScans(orgId: Types.ObjectId | string): Promise<{ created: number; updated: number; sites: number }> {
  const sites = await Site.find({ orgId }).select("_id").lean();
  const totals = { created: 0, updated: 0, sites: 0 };
  for (const site of sites) {
    const scan = await Scan.findOne({ siteId: site._id, status: "complete" }).sort({ createdAt: -1 }).lean();
    if (!scan) continue;
    const r = await syncVendorsFromScan(orgId, site._id, scan);
    totals.created += r.created;
    totals.updated += r.updated;
    totals.sites++;
  }
  return totals;
}

export type VendorCoverage = { active: number; missingDpa: number; scanned: boolean };

/** Inputs for the "processing agreements" checklist item. */
export async function vendorCoverage(orgId: Types.ObjectId | string): Promise<VendorCoverage> {
  const [active, missingDpa, scanned] = await Promise.all([
    Vendor.countDocuments({ orgId, archivedAt: null }),
    Vendor.countDocuments({ orgId, archivedAt: null, dpaStatus: { $in: ["not_started", "requested"] } }),
    Site.exists({ orgId, lastScanId: { $exists: true } }),
  ]);
  return { active, missingDpa, scanned: Boolean(scanned) };
}
