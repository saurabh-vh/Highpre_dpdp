import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScanForm } from "@/components/scanner/scan-form";
import { ScanReport, type ScanReportData } from "@/components/scanner/scan-report";
import { formatDate, hostnameOf } from "@/lib/format";
import { reportExpiresAt } from "@/lib/public-scan/report";
import { findPublicReport } from "@/lib/public-scan/store";

type Props = { params: Promise<{ id: string }> };

// Shared links are unlisted: never indexed, never followed.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const report = await findPublicReport((await params).id);
  return {
    title: report ? `Privacy scan of ${hostnameOf(report.url)}` : "Scan report",
    robots: { index: false, follow: false },
  };
}

export default async function SharedScanReportPage({ params }: Props) {
  const { id } = await params;
  const report = await findPublicReport(id);
  if (!report) notFound();

  const data: ScanReportData = {
    url: report.url,
    score: report.score,
    pagesScanned: report.pagesScanned,
    forms: report.forms.map((f) => ({ page: f.page ?? "", fields: f.fields })),
    trackers: report.trackers.map((t) => ({ id: t.id ?? "", name: t.name ?? "", category: t.category ?? "" })),
    privacyNoticeUrl: report.privacyNoticeUrl ?? undefined,
    consentTool: report.consentTool ?? undefined,
    findings: report.findings.map((f) => ({ id: f.id, severity: f.severity, title: f.title, detail: f.detail ?? "" })),
    reportId: report.reportId,
  };

  return (
    <div className="min-h-dvh px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-36">
      <div className="mx-auto mb-6 max-w-5xl sm:mb-8">
        <p className="text-2xs font-medium uppercase tracking-[0.14em] text-mist">Shared scan report</p>
        <h1 className="mt-2 text-xl font-semibold text-balance [overflow-wrap:anywhere] sm:text-2xl">{hostnameOf(report.url)}</h1>
        <p className="mt-2 text-xs text-mist">
          Scanned {formatDate(report.createdAt)} · link works until {formatDate(reportExpiresAt(report.createdAt))}
        </p>
      </div>
      <ScanReport url={report.url} initial={data} />
      <div className="mx-auto mt-12 flex max-w-xl sm:mt-16 flex-col items-center text-center">
        <h2 className="text-base font-medium">Scan your own website</h2>
        <p className="mt-2 text-sm text-mist">Free, in under a minute.</p>
        <ScanForm size="md" className="mt-6 flex justify-center" />
      </div>
    </div>
  );
}
