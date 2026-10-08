import { ScanSearch } from "lucide-react";
import { ScanFindings, type FindingView } from "@/components/scanner/scan-findings";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProgressRing } from "@/components/ui/progress-ring";
import { RunScanButton } from "@/features/sites/run-scan-button";
import { requireSite } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { Scan } from "@/models";

export const metadata = { title: "Website scan" };

export default async function SiteScanPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ new?: string }> }) {
  const [{ siteId }, { new: isNew }] = await Promise.all([params, searchParams]);
  const site = await requireSite(siteId);
  const scan = await Scan.findOne({ siteId: site._id }).sort({ createdAt: -1 }).lean();
  const lastGood = scan?.status === "complete" ? scan : await Scan.findOne({ siteId: site._id, status: "complete" }).sort({ createdAt: -1 }).lean();

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Website scan"
          description={lastGood ? `Last scanned ${formatDateTime(lastGood.createdAt)}. Static HTML only; content added later by JavaScript may not appear.` : "Find the forms, trackers and gaps that matter under DPDP."}
          action={<RunScanButton siteId={site.id} hasScan={Boolean(lastGood)} autoStart={Boolean(isNew) && !scan} />}
        />
        {lastGood ? (
          <PanelBody className="grid gap-10 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2">
              <ProgressRing value={lastGood.score} size={128} label="scan score" />
              <p className="text-2xs text-mist">{lastGood.pagesScanned.length} pages checked</p>
            </div>
            <ScanFindings findings={lastGood.findings as FindingView[]} />
          </PanelBody>
        ) : (
          <EmptyState icon={ScanSearch} title="No scan yet" description="Run your first scan to see what this website collects and what needs fixing." />
        )}
      </Panel>

      {lastGood && (
        <div className="grid gap-6 md:grid-cols-2">
          <Panel>
            <PanelHeader title="Trackers found" description="Hold these back until visitors consent." />
            <PanelBody>
              {lastGood.trackers.length === 0 ? (
                <p className="text-xs text-mist">None detected in the page source.</p>
              ) : (
                <ul className="space-y-3">
                  {lastGood.trackers.map((t) => (
                    <li key={t.id} className="flex justify-between text-sm">
                      <span>{t.name}</span>
                      <span className="text-xs capitalize text-mist">{t.category?.replace("_", " ")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Forms collecting personal data" description="Each needs a purpose in your inventory." />
            <PanelBody>
              {lastGood.forms.length === 0 ? (
                <p className="text-xs text-mist">None found on the pages we checked.</p>
              ) : (
                <ul className="space-y-4">
                  {lastGood.forms.map((f, i) => (
                    <li key={i} className="text-sm">
                      <span className="block truncate text-xs text-mist">{f.page}</span>
                      {f.fields.join(", ")}
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>
      )}
    </div>
  );
}
