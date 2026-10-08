import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { DecisionChart, DecisionLegend } from "@/components/dashboard/consent-chart";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { requireSite } from "@/lib/auth/guards";
import { RANGES, consentAnalytics, percent, pickRange, rate, type DecisionKind } from "@/lib/consent/analytics";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConsentRecord } from "@/models";

export const metadata = { title: "Consent analytics" };

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ range?: string }> }) {
  const [{ siteId }, sp] = await Promise.all([params, searchParams]);
  const site = await requireSite(siteId);
  const days = pickRange(sp.range);
  const base = `/dashboard/sites/${site.id}`;

  const [a, any] = await Promise.all([consentAnalytics([site], days), ConsentRecord.exists({ siteId: site._id })]);

  if (!any) {
    return (
      <Panel>
        <EmptyState
          icon={BarChart3}
          title="No consent decisions yet"
          description="Once the consent banner is on your website, you'll see how visitors answer it here: who accepts, rejects or picks purposes, in which language, day by day."
          action={<ButtonLink href={`${base}/banner`}>Install the banner</ButtonLink>}
        />
      </Panel>
    );
  }

  const prev = a.previous;
  const vs = `vs previous ${days} days`;
  const countChange = prev.total > 0 ? `${a.total >= prev.total ? "+" : "−"}${Math.round(Math.abs(rate(a.total - prev.total, prev.total)) * 100)}% ${vs}` : `No decisions in the previous ${days} days`;
  // Rates change in percentage points; a relative change of a rate is hard to read.
  const rateChange = (kind: DecisionKind) => {
    if (prev.total === 0 || a.total === 0) return undefined;
    const pts = Math.round((rate(a.mix[kind], a.total) - rate(prev.mix[kind], prev.total)) * 100);
    return pts === 0 ? `No change ${vs}` : `${pts > 0 ? "+" : "−"}${Math.abs(pts)} pts ${vs}`;
  };

  return (
    <div className="space-y-6">
      <nav aria-label="Time range" className="inline-flex gap-1 rounded-full border border-line bg-surface p-1">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`${base}/analytics?range=${r}`}
            aria-current={r === days ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300 ease-apple",
              r === days ? "bg-paper text-ink" : "text-fog hover:text-paper",
            )}
          >
            {r} days
          </Link>
        ))}
      </nav>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Decisions" value={formatNumber(a.total)} note={countChange} />
        <StatCard label="Accepted all" value={percent(rate(a.mix.accept, a.total))} note={rateChange("accept")} />
        <StatCard label="Rejected all" value={percent(rate(a.mix.reject, a.total))} note={rateChange("reject")} />
        <StatCard label="Customised" value={percent(rate(a.mix.custom, a.total))} note={rateChange("custom")} />
      </div>

      <Panel>
        <PanelHeader
          title="Decisions per day"
          description={`Every choice made in the banner, by day (India time). A visitor who changes their mind counts again. ${formatNumber(a.mix.withdraw)} withdrawal${a.mix.withdraw === 1 ? "" : "s"} in this period.`}
          action={<DecisionLegend />}
        />
        <PanelBody>
          <DecisionChart series={a.series} />
        </PanelBody>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="self-start">
          <PanelHeader title="Opt-in by purpose" description="Share of decisions that allowed each optional purpose. Essential purposes are always on and not shown." />
          <PanelBody>
            {a.purposes.length === 0 ? (
              <p className="text-xs text-mist">No optional purposes were answered in this period.</p>
            ) : (
              <ul className="space-y-5">
                {a.purposes.map((p) => (
                  <li key={p.key}>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-fog">{p.name}</span>
                      <span className="shrink-0 tabular-nums text-mist">
                        <span className="font-medium text-paper">{percent(p.rate)}</span> · {formatNumber(p.granted)} of {formatNumber(p.total)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
                      <div className="h-full rounded-full bg-paper transition-[width] duration-700 ease-apple" style={{ width: `${p.rate * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel className="self-start">
          <PanelHeader title="By language" description="The language the banner was shown in when the visitor decided." />
          {a.languages.length === 0 ? (
            <PanelBody><p className="text-xs text-mist">No decisions in this period.</p></PanelBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Language</th>
                    <th scope="col" className="text-right">Decisions</th>
                    <th scope="col" className="text-right">Accepted all</th>
                  </tr>
                </thead>
                <tbody>
                  {a.languages.map((l) => (
                    <tr key={l.code}>
                      <td className="text-xs">{l.label}</td>
                      <td className="text-right text-xs tabular-nums">{formatNumber(l.total)}</td>
                      <td className="text-right text-xs tabular-nums">{percent(l.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
