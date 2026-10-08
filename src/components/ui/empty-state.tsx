import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="glass mb-5 grid size-12 place-items-center rounded-2xl">
        <Icon className="size-5 text-fog" strokeWidth={1.6} aria-hidden />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs text-mist text-pretty">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
