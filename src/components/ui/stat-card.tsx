import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger";
const noteTone: Record<Tone, string> = { default: "text-mist", success: "text-success", warning: "text-warning", danger: "text-danger" };

/** One headline number with context. Links when there's somewhere to act on it. */
export function StatCard({ label, value, note, tone = "default", icon: Icon, href }: { label: string; value: string; note?: string; tone?: Tone; icon?: LucideIcon; href?: string }) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-mist">{label}</p>
        {Icon && <Icon className="size-4 text-mist" strokeWidth={1.7} aria-hidden />}
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      {note && <p className={cn("mt-1 text-xs font-medium", noteTone[tone])}>{note}</p>}
    </>
  );
  const cls = "surface block rounded-panel px-5 py-4";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-white/20")}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
