"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SiteStep = { segment: string; label: string; done?: boolean };

/**
 * Setup steps for a website, in the order they should be done, followed by
 * the records views. Numbered steps turn into ticks as they're completed.
 */
export function SiteTabs({ siteId, steps, extras }: { siteId: string; steps: SiteStep[]; extras: SiteStep[] }) {
  const pathname = usePathname();
  const base = `/dashboard/sites/${siteId}`;
  const isActive = (segment: string) => (segment === "" ? pathname === base : pathname.startsWith(base + segment));

  return (
    <nav aria-label="Website sections" className="-mx-4 mb-8 overflow-x-auto px-4">
      <div className="flex min-w-max items-center gap-2">
        <ol className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
          {steps.map((step, i) => {
            const active = isActive(step.segment);
            return (
              <li key={step.label}>
                <Link
                  href={base + step.segment}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-full py-1.5 pl-1.5 pr-4 text-xs font-medium transition-colors duration-200",
                    active ? "bg-paper text-ink" : "text-fog hover:bg-white/[0.05] hover:text-paper",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 place-items-center rounded-full text-2xs font-semibold tabular-nums",
                      step.done ? "bg-success text-ink" : active ? "bg-ink text-paper" : "bg-white/[0.1] text-fog",
                    )}
                  >
                    {step.done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  {step.label}
                  {step.done && <span className="sr-only">(done)</span>}
                </Link>
              </li>
            );
          })}
        </ol>
        <ul className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
          {extras.map((tab) => {
            const active = isActive(tab.segment);
            return (
              <li key={tab.label}>
                <Link
                  href={base + tab.segment}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-200",
                    active ? "bg-paper text-ink" : "text-fog hover:bg-white/[0.05] hover:text-paper",
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
