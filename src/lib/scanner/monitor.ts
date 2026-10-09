import "server-only";
import type { Types } from "mongoose";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/mailer";
import { siteChangesAlertEmail } from "@/lib/mail/templates";
import { Organization, Site, User } from "@/models";
import { alertable, type ScanChange } from "./changes";
import { scanSite } from "./run-site-scan";

/**
 * Weekly monitoring, run from the hourly cron: rescans a few sites whose last
 * scan is over a week old and emails owners and admins when something got worse.
 * Sites are scanned one at a time and a run stops starting new scans after a
 * time budget, to stay gentle on a small server and inside the cron's limit.
 */

export const RESCAN_AFTER_DAYS = 7;
export const SITES_PER_RUN = 3;
const ALERT_EVERY_HOURS = 24;
const RUN_BUDGET_MS = 40_000;

type DueSite = { _id: Types.ObjectId; orgId: Types.ObjectId; name: string; url: string };

/** Monitored sites never scanned, or whose latest scan (complete or failed) is over a week old; oldest first. */
export async function dueSites(now = new Date(), limit = SITES_PER_RUN): Promise<DueSite[]> {
  const cutoff = new Date(now.getTime() - RESCAN_AFTER_DAYS * 86_400_000);
  return Site.aggregate<DueSite>([
    { $match: { "monitoring.enabled": { $ne: false } } },
    {
      $lookup: {
        from: "scans",
        let: { siteId: "$_id" },
        pipeline: [{ $match: { $expr: { $eq: ["$siteId", "$$siteId"] } } }, { $sort: { createdAt: -1 } }, { $limit: 1 }, { $project: { createdAt: 1 } }],
        as: "latest",
      },
    },
    { $addFields: { lastScanAt: { $ifNull: [{ $arrayElemAt: ["$latest.createdAt", 0] }, new Date(0)] } } },
    { $match: { lastScanAt: { $lt: cutoff } } },
    { $sort: { lastScanAt: 1, _id: 1 } },
    { $limit: limit },
    { $project: { orgId: 1, name: 1, url: 1 } },
  ]);
}

/**
 * Emails a site's owners and admins about changes, at most once per 24 hours
 * per site. The throttle is claimed atomically before sending, so overlapping
 * cron runs can't both send. Returns whether an alert went out.
 */
export async function alertSiteChanges(site: DueSite, changes: ScanChange[], now = new Date()): Promise<boolean> {
  const worth = alertable(changes);
  if (worth.length === 0) return false;
  const since = new Date(now.getTime() - ALERT_EVERY_HOURS * 3_600_000);
  const claimed = await Site.updateOne({ _id: site._id, "monitoring.lastAlertAt": { $not: { $gte: since } } }, { "monitoring.lastAlertAt": now });
  if (claimed.modifiedCount === 0) return false;

  const org = await Organization.findById(site.orgId).lean();
  const ids = (org?.members ?? []).filter((m) => m.role !== "member").map((m) => m.userId);
  const users = await User.find({ _id: { $in: ids } }).select("email").lean();
  const emails = [...new Set(users.map((u) => u.email))];
  const url = `${env().APP_URL}/dashboard/sites/${site._id}`;
  const results = await Promise.allSettled(emails.map((to) => sendMail(siteChangesAlertEmail({ to, siteName: site.name, changes, url }))));
  if (emails.length > 0 && results.every((r) => r.status === "rejected")) {
    // Nobody got it: release the throttle so the next scan can try again.
    await Site.updateOne({ _id: site._id, "monitoring.lastAlertAt": now }, { $unset: { "monitoring.lastAlertAt": 1 } });
    return false;
  }
  await audit(site.orgId, null, "site.monitoring_alert", `Weekly scan of ${site.name} found: ${worth.map((c) => c.kind.replace(/_/g, " ")).join(", ")}. Emailed owners and admins.`, site._id);
  return true;
}

/** One cron run of the weekly rescans. */
export async function runScheduledScans(now = new Date()): Promise<{ sitesRescanned: number; rescanFailures: number; changeAlerts: number }> {
  const stats = { sitesRescanned: 0, rescanFailures: 0, changeAlerts: 0 };
  const started = Date.now();
  for (const site of await dueSites(now)) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    try {
      const outcome = await scanSite(site, { trigger: "scheduled" });
      if (!outcome.ok) {
        stats.rescanFailures++;
        continue;
      }
      stats.sitesRescanned++;
      if (await alertSiteChanges(site, outcome.changes, now)) stats.changeAlerts++;
    } catch (error) {
      stats.rescanFailures++;
      log.error("monitoring.scan_failed", { siteId: String(site._id), error: String(error) });
    }
  }
  return stats;
}
