import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "solid" | "outline" | "muted" | "success" | "warning" | "danger" | "info";

const tones: Record<BadgeTone, string> = {
  solid: "bg-paper text-ink",
  outline: "border border-white/20 text-paper",
  muted: "bg-white/[0.07] text-fog",
  success: "bg-success/[0.12] text-success",
  warning: "bg-warning/[0.12] text-warning",
  danger: "bg-danger/[0.14] text-danger",
  info: "bg-info/[0.12] text-info",
};

const dotted = new Set<BadgeTone>(["success", "warning", "danger", "info"]);

/** Small status label. Coloured tones get a leading dot so status isn't conveyed by colour alone. */
export function Badge({ tone = "muted", className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-2xs font-medium", tones[tone], className)}>
      {dotted.has(tone) && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
