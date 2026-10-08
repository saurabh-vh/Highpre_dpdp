import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger";

const styles: Record<Tone, { box: string; icon: LucideIcon; iconClass: string }> = {
  info: { box: "border-info/25 bg-info/[0.06]", icon: Info, iconClass: "text-info" },
  success: { box: "border-success/25 bg-success/[0.06]", icon: CircleCheck, iconClass: "text-success" },
  warning: { box: "border-warning/30 bg-warning/[0.07]", icon: TriangleAlert, iconClass: "text-warning" },
  danger: { box: "border-danger/30 bg-danger/[0.07]", icon: CircleAlert, iconClass: "text-danger" },
};

/** Inline message that explains a state and, ideally, what to do about it. */
export function Callout({ tone = "info", title, children, action, className }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const s = styles[tone];
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("flex flex-wrap items-start gap-3 rounded-field border px-4 py-3.5", s.box, className)}>
      <s.icon className={cn("mt-0.5 size-4 shrink-0", s.iconClass)} strokeWidth={2} aria-hidden />
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-fog">
        {title && <p className="mb-0.5 text-sm font-medium text-paper">{title}</p>}
        {children}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
