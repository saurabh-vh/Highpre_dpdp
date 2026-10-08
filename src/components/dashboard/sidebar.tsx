"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Globe, LogOut, Menu, UserRound, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SidebarAgentDownload } from "@/features/agent/agent-controls";
import { logoutAction } from "@/features/auth/actions";
import { switchOrgAction } from "@/features/team/actions";
import { can } from "@/lib/auth/permissions";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav-items";

type Counts = { openRequests: number; openBreaches: number; openAlerts: number };
type SiteLink = { id: string; name: string; hasFavicon: boolean };
type Props = {
  user: { name: string; email: string };
  org: { id: string; name: string; planName: string; paid: boolean };
  orgs: { id: string; name: string }[];
  role: string;
  counts: Counts;
  sites: SiteLink[];
};

function OrgSwitcher({ org, orgs }: Pick<Props, "org" | "orgs">) {
  const header = (
    <span className="min-w-0 flex-1 text-left">
      <span className="block truncate text-sm font-medium">{org.name}</span>
      <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-mist">
        <span className={cn("size-1.5 rounded-full", org.paid ? "bg-success" : "bg-mist")} aria-hidden />
        {org.planName} plan
      </span>
    </span>
  );
  if (orgs.length < 2) return <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5">{header}</div>;
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-line px-3 py-2.5 transition-colors hover:border-white/20 [&::-webkit-details-marker]:hidden">
        {header}
        <ChevronsUpDown className="size-4 shrink-0 text-mist" aria-hidden />
        <span className="sr-only">Switch organisation</span>
      </summary>
      <ul className="absolute inset-x-0 top-full z-50 mt-2 space-y-0.5 rounded-xl border border-line bg-raised p-1 shadow-2xl">
        {orgs.map((o) => (
          <li key={o.id}>
            <form action={switchOrgAction.bind(null, o.id)}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-white/[0.06]">
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.id === org.id && <Check className="size-3.5" aria-hidden />}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** A site's favicon served from HighPre, falling back to a globe icon. */
function SiteIcon({ site }: { site: SiteLink }) {
  const [failed, setFailed] = useState(false);
  if (!site.hasFavicon || failed) return <Globe className="size-3.5 text-mist" aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element -- tiny same-origin icon, no optimisation needed
  return <img src={`/dashboard/sites/${site.id}/favicon`} alt="" width={14} height={14} className="size-3.5 rounded-sm object-contain" onError={() => setFailed(true)} />;
}

const MAX_SITES = 6;

export function Sidebar({ user, org, orgs, role, counts, sites }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const nav = (
    <nav aria-label="Dashboard" className="flex-1 space-y-6 overflow-y-auto">
      {NAV_GROUPS.map((group, gi) => (
        <div key={gi}>
          {group.label && <p className="mb-1.5 px-3 text-2xs font-medium uppercase tracking-wider text-mist/80">{group.label}</p>}
          <ul className="space-y-0.5">
            {group.items
              .filter((item) => !item.permission || can(role, item.permission))
              .map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const count = item.countKey ? counts[item.countKey] : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-200",
                        active ? "bg-white/[0.09] font-medium text-paper" : "text-fog hover:bg-white/[0.05] hover:text-paper",
                      )}
                    >
                      <item.icon className={cn("size-[17px]", active ? "text-paper" : "text-mist")} strokeWidth={active ? 2 : 1.7} aria-hidden />
                      <span className="flex-1">{item.label}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            "min-w-5 rounded-full px-1.5 text-center text-2xs font-semibold tabular-nums",
                            item.countKey === "openAlerts" ? "bg-danger/[0.18] text-danger" : "bg-warning/[0.15] text-warning",
                          )}
                        >
                          {count}
                          <span className="sr-only"> open</span>
                        </span>
                      )}
                    </Link>
                    {item.showSites && sites.length > 0 && (
                      <ul className="ml-[22px] mt-0.5 space-y-0.5 border-l border-line pl-2.5">
                        {sites.slice(0, MAX_SITES).map((site) => {
                          const href = `/dashboard/sites/${site.id}`;
                          const siteActive = pathname.startsWith(href);
                          return (
                            <li key={site.id}>
                              <Link
                                href={href}
                                aria-current={siteActive ? "page" : undefined}
                                className={cn(
                                  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-xs transition-colors",
                                  siteActive ? "bg-white/[0.07] text-paper" : "text-mist hover:bg-white/[0.04] hover:text-paper",
                                )}
                              >
                                <SiteIcon site={site} />
                                <span className="truncate">{site.name}</span>
                              </Link>
                            </li>
                          );
                        })}
                        {sites.length > MAX_SITES && (
                          <li>
                            <Link href="/dashboard/sites" className="flex h-7 items-center px-2.5 text-2xs text-mist hover:text-paper">
                              +{sites.length - MAX_SITES} more
                            </Link>
                          </li>
                        )}
                      </ul>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-line pt-3">
      <Link
        href="/dashboard/account"
        className={cn("flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.05]", pathname === "/dashboard/account" && "bg-white/[0.07]")}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08]">
          <UserRound className="size-4 text-fog" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium">{user.name}</span>
          <span className="block truncate text-2xs text-mist">{user.email}</span>
        </span>
      </Link>
      <form action={logoutAction} className="mt-1">
        <button type="submit" className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-xs text-mist transition-colors hover:bg-white/[0.05] hover:text-paper">
          <LogOut className="size-4" strokeWidth={1.6} aria-hidden />
          Log out
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          className="grid size-10 place-items-center rounded-xl hover:bg-white/10"
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
        </button>
      </div>
      {open && (
        <div id="mobile-nav" className="fixed inset-x-3 top-16 z-40 flex max-h-[calc(100dvh-5rem)] animate-rise-in flex-col gap-4 overflow-y-auto rounded-panel border border-line bg-raised p-4 shadow-2xl lg:hidden">
          <OrgSwitcher org={org} orgs={orgs} />
          <SidebarAgentDownload />
          {nav}
          {footer}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-4 border-r border-line bg-surface px-3 py-5 lg:flex">
        <Logo href="/dashboard" className="px-3" />
        <OrgSwitcher org={org} orgs={orgs} />
        <SidebarAgentDownload />
        {nav}
        {footer}
      </aside>
    </>
  );
}
