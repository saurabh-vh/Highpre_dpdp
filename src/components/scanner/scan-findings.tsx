import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type FindingView = { id: string; severity: "critical" | "warning" | "pass"; title: string; detail: string };

const icon = { critical: CircleAlert, warning: TriangleAlert, pass: CircleCheck } as const;
const label = { critical: "Must fix", warning: "Review", pass: "Looks good" } as const;

/** Prioritised list of scan findings. Shared by the public report and the dashboard. */
export function ScanFindings({ findings }: { findings: FindingView[] }) {
  return (
    <ul className="divide-y divide-white/[0.08]">
      {findings.map((f) => {
        const Icon = icon[f.severity];
        return (
          <li key={f.id} className="flex gap-4 py-5 first:pt-0 last:pb-0">
            <Icon
              className={cn("mt-0.5 size-5 shrink-0", f.severity === "pass" ? "text-success" : f.severity === "warning" ? "text-warning" : "text-danger")}
              strokeWidth={f.severity === "critical" ? 2.2 : 1.7}
              aria-hidden
            />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                {f.title}
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-2xs font-medium",
                    f.severity === "critical" ? "bg-danger/[0.14] text-danger" : f.severity === "warning" ? "bg-warning/[0.12] text-warning" : "bg-success/[0.12] text-success",
                  )}
                >
                  {label[f.severity]}
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-mist">{f.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
