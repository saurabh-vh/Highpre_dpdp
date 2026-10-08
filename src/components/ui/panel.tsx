import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Primary content surface in the dashboard. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("surface rounded-panel", className)} {...props} />;
}

export function PanelHeader({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-6 py-5">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <span className="mt-0.5 text-mist">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-1 max-w-prose text-xs text-mist">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-6", className)} {...props} />;
}
