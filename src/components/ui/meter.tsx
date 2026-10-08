import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Usage against a limit, e.g. "2 of 3 websites". Turns amber near the limit and red over it. */
export function Meter({ label, used, limit, className }: { label: string; used: number; limit: number; className?: string }) {
  const ratio = limit > 0 ? used / limit : 0;
  const tone = ratio > 1 ? "bg-danger" : ratio >= 0.8 ? "bg-warning" : "bg-paper";
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-fog">{label}</span>
        <span className={cn("tabular-nums", ratio > 1 ? "font-medium text-danger" : "text-mist")}>
          {formatNumber(used)} / {formatNumber(limit)}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-700 ease-apple", tone)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}
