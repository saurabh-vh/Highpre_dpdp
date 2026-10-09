"use client";

import { useEffect, useState } from "react";
import { CubeField } from "@/components/graphics/cube-field";
import { ButtonLink } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ScanForm } from "./scan-form";
import { ScanFindings, type FindingView } from "./scan-findings";
import { ScanShare } from "./scan-share";

type Report = {
  url: string;
  score: number;
  pagesScanned: string[];
  forms: { page: string; fields: string[] }[];
  trackers: { id: string; name: string; category: string }[];
  privacyNoticeUrl?: string;
  consentTool?: string;
  findings: FindingView[];
  /** Public id of the stored, shareable copy (absent if it couldn't be saved). */
  reportId?: string | null;
};

export type ScanReportData = Report;

type State = { status: "loading" } | { status: "error"; message: string } | { status: "done"; report: Report };

const PROGRESS = ["Fetching your homepage", "Looking for forms and trackers", "Checking contact and signup pages", "Writing up the findings"];

/** Runs a public scan and renders the report, or renders a stored report (`initial`) without scanning. */
export function ScanReport({ url, initial }: { url: string; initial?: Report }) {
  const [state, setState] = useState<State>(initial ? { status: "done", report: initial } : { status: "loading" });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (initial) return;
    const controller = new AbortController();
    setState({ status: "loading" });
    setStep(0);
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, PROGRESS.length - 1)), 2200);

    fetch("/api/public/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "The scan failed. Try again.");
        setState({ status: "done", report: data as Report });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setState({ status: "error", message: err.message });
      })
      .finally(() => clearInterval(ticker));

    return () => {
      controller.abort();
      clearInterval(ticker);
    };
  }, [url, initial]);

  if (state.status === "loading") {
    return (
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-panel border hairline sm:rounded-sheet" aria-busy="true">
        <CubeField className="relative h-60 sm:h-72" cols={22} rows={22} size={40} cycleSeconds={4} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <p className="text-lg font-medium [overflow-wrap:anywhere]">Scanning {url}</p>
          <p className="mt-1 text-sm text-mist" role="status" aria-live="polite">
            {PROGRESS[step]}…
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto max-w-xl text-center">
        <p className="text-lg font-medium [overflow-wrap:anywhere]">We couldn&apos;t scan {url}</p>
        <p className="mt-2 text-sm text-mist">{state.message}</p>
        <div className="mt-8 flex justify-center">
          <ScanForm size="md" />
        </div>
      </div>
    );
  }

  const { report } = state;
  const critical = report.findings.filter((f) => f.severity === "critical").length;

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="glass flex min-w-0 flex-col items-center rounded-panel p-6 text-center sm:p-8 lg:sticky lg:top-28 lg:self-start">
        <ProgressRing value={report.score} size={148} label="readiness" />
        <p className="mt-6 max-w-full text-sm font-medium [overflow-wrap:anywhere]">{new URL(report.url).hostname}</p>
        <p className="mt-1 text-xs text-mist">
          {report.pagesScanned.length} page{report.pagesScanned.length === 1 ? "" : "s"} scanned
        </p>
        <p className="mt-6 text-sm text-fog text-pretty">
          {critical > 0
            ? `${critical} issue${critical === 1 ? "" : "s"} to fix before 13 May 2027.`
            : "A good start. Consent records and request handling still need to be in place."}
        </p>
        <ButtonLink href="/register" className="mt-6 w-full">
          Fix these with HighPre
        </ButtonLink>
        <p className="mt-3 text-2xs text-mist">Free during early access</p>
      </aside>

      <div className="min-w-0 space-y-4 sm:space-y-6">
        <section className="glass rounded-panel p-5 sm:p-8">
          <h2 className="mb-6 text-sm font-semibold">Findings</h2>
          <ScanFindings findings={report.findings} />
        </section>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          <section className="glass min-w-0 rounded-panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold">Trackers</h2>
            {report.trackers.length === 0 ? (
              <p className="mt-3 text-sm text-mist sm:text-xs">None detected in the page source.</p>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {report.trackers.map((t) => (
                  <li key={t.id} className="flex items-baseline justify-between gap-4 text-sm sm:text-xs">
                    <span className="min-w-0">{t.name}</span>
                    <span className="shrink-0 text-right text-mist">{t.category.replace("_", " ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="glass min-w-0 rounded-panel p-5 sm:p-6">
            <h2 className="text-sm font-semibold">Forms collecting personal data</h2>
            {report.forms.length === 0 ? (
              <p className="mt-3 text-sm text-mist sm:text-xs">None found on the pages we checked.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {report.forms.slice(0, 6).map((f, i) => (
                  <li key={`${f.page}-${i}`} className="text-sm sm:text-xs">
                    <span className="block truncate text-mist">{new URL(f.page).pathname}</span>
                    <span className="mt-0.5 block [overflow-wrap:anywhere]">{f.fields.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        {report.reportId && <ScanShare reportId={report.reportId} />}
        <p className="px-2 text-xs leading-relaxed text-mist sm:text-2xs">
          This scan reads your pages&apos; HTML. Content added later by JavaScript may not appear. It&apos;s a starting point, not a legal audit.
        </p>
      </div>
    </div>
  );
}
