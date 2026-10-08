import { cn } from "@/lib/utils";

/** Score colour: red below 50, amber below 80, green from 80. */
export const scoreColor = (value: number) => (value >= 80 ? "#30D158" : value >= 50 ? "#FFB340" : "#FF6961");

/** Circular score indicator. Pure SVG, renders on the server. */
export function ProgressRing({ value, size = 120, stroke = 8, label, className, tone = true }: { value: number; size?: number; stroke?: number; label?: string; className?: string; tone?: boolean }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone ? scoreColor(clamped) : "#fff"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <span className="block text-xl font-semibold tabular-nums tracking-tight">{clamped}</span>
        {label && <span className="block text-2xs text-mist">{label}</span>}
      </div>
      <span className="sr-only">{`${clamped} out of 100`}</span>
    </div>
  );
}
