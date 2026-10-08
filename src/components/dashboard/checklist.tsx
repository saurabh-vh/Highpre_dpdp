import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import type { ChecklistItem } from "@/lib/compliance/checklist";
import { cn } from "@/lib/utils";

/** Actionable to-do list. Open items link straight to where they're fixed. */
export function Checklist({ items, context }: { items: (ChecklistItem & { context?: string })[]; context?: boolean }) {
  return (
    <ul className="divide-y divide-white/[0.08]">
      {items.map((item) => (
        <li key={`${item.context ?? ""}-${item.id}`}>
          <Link
            href={item.href}
            className={cn("group flex items-center gap-4 py-3.5 transition-colors", item.done ? "text-mist" : "hover:text-paper")}
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border transition-colors",
                item.done ? "border-transparent bg-success/20 text-success" : "border-white/30 group-hover:border-white",
              )}
            >
              {item.done && <Check className="size-3.5" strokeWidth={2.4} aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", item.done && "line-through decoration-white/20")}>{item.label}</span>
              {!item.done && (
                <span className="block truncate text-xs text-mist">
                  {context && item.context ? `${item.context}: ` : ""}
                  {item.hint}
                </span>
              )}
            </span>
            {!item.done && <ChevronRight className="size-4 text-mist transition-transform duration-300 ease-apple group-hover:translate-x-0.5" aria-hidden />}
            <span className="sr-only">{item.done ? "Done" : "To do"}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
