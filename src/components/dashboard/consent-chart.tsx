import Link from "next/link";
import { ScrollText } from "lucide-react";
import { percent, rate, type ConsentAnalytics, type DayPoint, type DecisionKind } from "@/lib/consent/analytics";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Stacking order, bottom to top. Colour is backed by the legend and the hidden table. */
export const DECISION_KINDS: { kind: DecisionKind; label: string; fill: string; bg: string }[] = [
  { kind: "accept", label: "Accepted all", fill: "fill-success", bg: "bg-success" },
  { kind: "custom", label: "Customised", fill: "fill-info", bg: "bg-info" },
  { kind: "reject", label: "Rejected all", fill: "fill-white/40", bg: "bg-white/40" },
  { kind: "withdraw", label: "Withdrew", fill: "fill-warning", bg: "bg-warning" },
];

const dayFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
export const formatDay = (day: string) => dayFmt.format(new Date(`${day}T00:00:00Z`));

export function DecisionLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-2xs text-mist", className)} aria-hidden>
      {DECISION_KINDS.map((k) => (
        <li key={k.kind} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", k.bg)} />
          {k.label}
        </li>
      ))}
    </ul>
  );
}

/** Stacked daily bars in plain SVG, with the same numbers in a table for screen readers. */
export function DecisionChart({ series }: { series: DayPoint[] }) {
  const max = Math.max(1, ...series.map((p) => p.total));
  const height = 100;
  const slot = 10;
  const gap = series.length > 45 ? 2 : 3;
  const first = series[0]?.day;
  const last = series.at(-1)?.day;

  return (
    <figure>
      <div className="flex items-stretch gap-3">
        <div className="flex flex-col justify-between py-0.5 text-right text-2xs tabular-nums text-mist" aria-hidden>
          <span>{formatNumber(max)}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${series.length * slot} ${height}`}
          preserveAspectRatio="none"
          className="h-40 w-full min-w-0 flex-1"
          role="img"
          aria-labelledby="decision-chart-title decision-chart-desc"
        >
          <title id="decision-chart-title">Consent decisions per day</title>
          <desc id="decision-chart-desc">
            {`Stacked bars from ${first ? formatDay(first) : ""} to ${last ? formatDay(last) : ""}, split into accepted all, customised, rejected all and withdrew. The busiest day had ${formatNumber(max)} decisions.`}
          </desc>
          <line x1={0} x2={series.length * slot} y1={height} y2={height} className="stroke-white/[0.12]" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {series.map((p, i) => {
            let y = height;
            return (
              <g key={p.day}>
                <title>{`${formatDay(p.day)}: ${formatNumber(p.total)} decision${p.total === 1 ? "" : "s"}`}</title>
                <rect x={i * slot} y={0} width={slot} height={height} className="fill-transparent" />
                {DECISION_KINDS.map((k) => {
                  const h = (p[k.kind] / max) * height;
                  if (h <= 0) return null;
                  y -= h;
                  return <rect key={k.kind} x={i * slot + gap / 2} y={y} width={slot - gap} height={h} className={k.fill} />;
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex gap-3 text-2xs text-mist" aria-hidden>
        {/* Same width as the y-axis labels, so the dates line up with the bars. */}
        <span className="invisible tabular-nums">{formatNumber(max)}</span>
        <div className="flex flex-1 justify-between">
          <span>{first && formatDay(first)}</span>
          <span>{last && formatDay(last)}</span>
        </div>
      </div>
      <table className="sr-only">
        <caption>Consent decisions per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Total</th>
            {DECISION_KINDS.map((k) => (
              <th key={k.kind} scope="col">{k.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((p) => (
            <tr key={p.day}>
              <th scope="row">{formatDay(p.day)}</th>
              <td>{p.total}</td>
              {DECISION_KINDS.map((k) => (
                <td key={k.kind}>{p[k.kind]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Overview card: decisions and accept-all rate with a sparkline, styled like StatCard. */
export function ConsentSummaryCard({ analytics: a, href }: { analytics: ConsentAnalytics; href: string }) {
  return (
    <Link href={href} className="surface block rounded-panel px-5 py-4 transition-colors hover:border-white/20">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-mist">Consent in the last {a.days} days</p>
        <ScrollText className="size-4 text-mist" strokeWidth={1.7} aria-hidden />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-xl font-semibold tabular-nums tracking-tight">{formatNumber(a.total)}</p>
        <Sparkline values={a.series.map((p) => p.total)} className="mb-1 w-24" />
      </div>
      <p className="mt-1 text-xs font-medium text-mist">
        {a.total > 0 ? `${percent(rate(a.mix.accept, a.total))} accepted all` : "No decisions yet"}
        {a.mix.withdraw > 0 && `, ${formatNumber(a.mix.withdraw)} withdrawn`}
      </p>
    </Link>
  );
}

/** Tiny decisions-per-day line for compact cards. Decorative: the card states the numbers. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? 100 / (values.length - 1) : 0;
  const points = values.map((v, i) => `${(i * step).toFixed(2)},${(28 - (v / max) * 26).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={cn("h-8 w-full", className)} aria-hidden>
      <polyline points={points} fill="none" className="stroke-fog" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
