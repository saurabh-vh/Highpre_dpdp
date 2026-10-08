/**
 * Derives a readiness checklist from what the business has set up. Each item
 * links to where it can be fixed, so the dashboard doubles as a to-do list.
 */

export type ChecklistItem = { id: string; label: string; hint: string; done: boolean; href: string };

type OrgLike = { grievanceEmail?: string | null; grievanceOfficerName?: string | null };
type SiteLike = {
  id: string;
  name: string;
  purposes: unknown[];
  publishedNoticeVersion?: number | null;
  widgetLastSeenAt?: Date | null;
  lastScanId?: unknown;
};

type VendorsLike = { active: number; missingDpa: number; scanned: boolean };

export function orgChecklist(org: OrgLike, open: { overdueRequests?: number; openBreaches?: number; vendors?: VendorsLike } = {}): ChecklistItem[] {
  const items: ChecklistItem[] = [
    {
      id: "grievance",
      label: "Name a grievance contact",
      hint: "Shown in every notice so people know who to contact.",
      done: Boolean(org.grievanceEmail && org.grievanceOfficerName),
      href: "/dashboard/settings",
    },
  ];
  if (open.vendors) items.push(vendorChecklistItem(open.vendors));
  // Live obligations only appear while something is outstanding.
  if (open.overdueRequests) {
    items.push({ id: "overdue", label: "Reply to overdue data requests", hint: `${open.overdueRequests} past your published deadline.`, done: false, href: "/dashboard/requests" });
  }
  if (open.openBreaches) {
    items.push({ id: "breach", label: "Finish the breach checklist", hint: `${open.openBreaches} incident${open.openBreaches > 1 ? "s" : ""} still open.`, done: false, href: "/dashboard/breaches" });
  }
  return items;
}

/** Done once every active vendor has a signed (or unneeded) DPA, and there's been a scan or a vendor to check. */
export function vendorChecklistItem(v: VendorsLike): ChecklistItem {
  const hint = v.missingDpa
    ? `${v.missingDpa} vendor${v.missingDpa > 1 ? "s" : ""} without a signed agreement.`
    : v.active || v.scanned
      ? "Every active vendor is covered."
      : "Scan a website or add the processors you use.";
  return { id: "vendors", label: "Data processing agreements in place for all vendors", hint, done: v.missingDpa === 0 && (v.active > 0 || v.scanned), href: "/dashboard/vendors" };
}

export function siteChecklist(site: SiteLike): ChecklistItem[] {
  const base = `/dashboard/sites/${site.id}`;
  return [
    { id: "scan", label: "Scan the website", hint: "Find forms and trackers that collect personal data.", done: Boolean(site.lastScanId), href: base },
    { id: "inventory", label: "List why you collect data", hint: "Each purpose, the data it uses and how long you keep it.", done: site.purposes.length > 0, href: `${base}/inventory` },
    { id: "notice", label: "Publish a privacy notice", hint: "Generated in English and Hindi from your purposes.", done: (site.publishedNoticeVersion ?? 0) > 0, href: `${base}/notice` },
    { id: "banner", label: "Install the consent banner", hint: "One script tag. We'll detect it automatically.", done: Boolean(site.widgetLastSeenAt), href: `${base}/banner` },
  ];
}

export function readinessScore(items: ChecklistItem[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((i) => i.done).length / items.length) * 100);
}
