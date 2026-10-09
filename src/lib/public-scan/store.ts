import "server-only";
import { connectDb } from "@/lib/db";
import { log } from "@/lib/log";
import type { ScanResult } from "@/lib/scanner";
import { PublicScanReport, type PublicScanReportDoc } from "@/models/public-scan-report";
import { isReportExpired, isReportId, newReportId } from "./report";

/** Saves a shareable snapshot of a public scan. Returns null (and logs) if it can't be stored. */
export async function savePublicReport(result: ScanResult): Promise<string | null> {
  try {
    await connectDb();
    const reportId = newReportId();
    await PublicScanReport.create({
      reportId,
      url: result.url,
      score: result.score,
      pagesScanned: result.pagesScanned,
      forms: result.forms,
      trackers: result.trackers,
      privacyNoticeUrl: result.privacyNoticeUrl,
      consentTool: result.consentTool,
      findings: result.findings,
    });
    return reportId;
  } catch (error) {
    log.error("public_scan.report_save_failed", { error: String(error) });
    return null;
  }
}

/** A live (unexpired) report by its public id, or null. */
export async function findPublicReport(reportId: string): Promise<(PublicScanReportDoc & { createdAt: Date }) | null> {
  if (!isReportId(reportId)) return null;
  await connectDb();
  const report = await PublicScanReport.findOne({ reportId }).lean();
  if (!report || isReportExpired(report.createdAt)) return null;
  return report;
}
