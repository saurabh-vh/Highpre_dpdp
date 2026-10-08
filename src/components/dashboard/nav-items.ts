import { CreditCard, FileCheck2, Globe, Handshake, History, Inbox, LaptopMinimalCheck, LayoutGrid, Settings, ShieldAlert, Users, type LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  countKey?: "openRequests" | "openBreaches" | "openAlerts";
  /** Lists the organisation's websites (with favicons) under this item. */
  showSites?: boolean;
  /** Hidden for roles without this permission. */
  permission?: Permission;
};

export const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [{ href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true }] },
  {
    label: "Compliance",
    items: [
      { href: "/dashboard/sites", label: "Websites", icon: Globe, showSites: true },
      { href: "/dashboard/vendors", label: "Vendors", icon: Handshake },
      { href: "/dashboard/requests", label: "Data requests", icon: Inbox, countKey: "openRequests" },
      { href: "/dashboard/breaches", label: "Breaches", icon: ShieldAlert, countKey: "openBreaches" },
      { href: "/dashboard/evidence", label: "Evidence pack", icon: FileCheck2 },
      { href: "/dashboard/agent", label: "Desktop agent", icon: LaptopMinimalCheck, countKey: "openAlerts" },
    ],
  },
  {
    label: "Organisation",
    items: [
      { href: "/dashboard/team", label: "Team", icon: Users },
      { href: "/dashboard/settings", label: "Business settings", icon: Settings },
      { href: "/dashboard/billing", label: "Plan and billing", icon: CreditCard },
      { href: "/dashboard/activity", label: "Activity", icon: History, permission: "settings" },
    ],
  },
];
