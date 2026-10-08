"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Segmented control that switches between panes (e.g. English / Hindi). */
export function Segmented({ items, label }: { items: { id: string; label: string; content: ReactNode }[]; label: string }) {
  const [active, setActive] = useState(items[0]?.id);
  return (
    <div>
      <div role="tablist" aria-label={label} className="mb-6 inline-flex max-w-full flex-wrap gap-1 rounded-[20px] border border-line bg-surface p-1">
        {items.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={active === item.id}
            onClick={() => setActive(item.id)}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300 ease-apple",
              active === item.id ? "bg-paper text-ink" : "text-fog hover:text-paper",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div key={item.id} role="tabpanel" hidden={active !== item.id}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
