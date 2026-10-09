import "server-only";
import type { Types } from "mongoose";
import { log } from "@/lib/log";
import { syncVendorsFromScan } from "@/lib/vendors/sync";
import { Scan, Site } from "@/models";
import { detectChanges, type ScanChange } from "./changes";
import { scanErrorMessage, scanWebsite } from "./index";
import { safeFetchImage } from "./safe-fetch";
import { fetchBrand } from "./brand";

export type ScanTrigger = "manual" | "scheduled";

type SiteLike = { _id: Types.ObjectId; orgId: Types.ObjectId; url: string };

export type SiteScanOutcome =
  | { ok: true; scanId: Types.ObjectId; score: number; changes: ScanChange[] }
  | { ok: false; error: string };

/**
 * Scans one of an organisation's websites and stores the result, for both the
 * "Scan now" button and the weekly monitoring job. Compares the result with
 * the previous complete scan, refreshes the site's favicon and syncs the
 * vendor register. A scan failure is stored as a failed scan and returned rather than thrown.
 */
export async function scanSite(site: SiteLike, { trigger }: { trigger: ScanTrigger }): Promise<SiteScanOutcome> {
  const previous = await Scan.findOne({ siteId: site._id, status: "complete" }).sort({ createdAt: -1 }).lean();
  try {
    const result = await scanWebsite(site.url);
    const changes = previous ? detectChanges(previous, result) : [];
    const scan = await Scan.create({ siteId: site._id, status: "complete", trigger, ...result, changes });
    const icon = (await safeFetchImage(result.faviconUrl)) ?? (await safeFetchImage(new URL("/favicon.ico", result.url).toString()));
    await Site.updateOne(
      { _id: site._id },
      { lastScanId: scan._id, ...(icon ? { favicon: { data: icon.data, contentType: icon.contentType, fetchedAt: new Date() } } : {}) },
    );
    // Brand colours for "Use my website's colours": optional, so a failure never fails the scan.
    await fetchBrand(result.url)
      .then(({ primary, background, text, font }) => Site.updateOne({ _id: site._id }, { brand: { primary, background, text, font, fetchedAt: new Date() } }))
      .catch((error) => log.warn("brand.fetch_failed", { siteId: String(site._id), error: String(error) }));
    // The scan itself succeeded; a vendor register hiccup shouldn't report it as failed.
    await syncVendorsFromScan(site.orgId, site._id, scan).catch((error) => log.error("vendors.sync_failed", { siteId: String(site._id), error: String(error) }));
    return { ok: true, scanId: scan._id, score: result.score, changes };
  } catch (error) {
    const message = scanErrorMessage(error);
    await Scan.create({ siteId: site._id, url: site.url, status: "failed", error: message, trigger });
    return { ok: false, error: message };
  }
}
