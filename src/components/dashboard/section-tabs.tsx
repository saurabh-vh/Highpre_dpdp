"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type SectionTab = { href: string; label: string; count?: number };

/** Tabs for a dashboard section, in the same style as the website tabs. The first tab is the section's home. */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const pathname = usePathname();
  const home = tabs[0]?.href;
  const isActive = (href: string) => (href === home ? pathname === href : pathname.startsWith(href));

  return (
    <nav aria-label={label} className="-mx-4 mb-8 overflow-x-auto px-4">
      <ul className="flex w-max items-center gap-1 rounded-full border border-line bg-surface p-1">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-medium transition-colors duration-200",
                  active ? "bg-paper text-ink" : "text-fog hover:bg-white/[0.05] hover:text-paper",
                )}
              >
                {tab.label}
                {Boolean(tab.count) && (
                  <span className={cn("min-w-5 rounded-full px-1.5 text-center text-2xs font-semibold tabular-nums", active ? "bg-danger text-ink" : "bg-danger/[0.18] text-danger")}>
                    {tab.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
