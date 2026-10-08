import Link from "next/link";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { requirePagePermission } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { AuditLog } from "@/models";

export const metadata = { title: "Activity" };

const PAGE_SIZE = 50;

const AREA: Record<string, string> = {
  org: "Account",
  team: "Team",
  billing: "Billing",
  site: "Website",
  notice: "Notice",
  inventory: "Inventory",
  banner: "Banner",
  settings: "Settings",
  request: "Request",
  breach: "Breach",
  export: "Export",
};

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { org } = await requirePagePermission("settings");
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const entries = await AuditLog.find({ orgId: org._id }).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).lean();
  const rows = entries.slice(0, PAGE_SIZE);

  return (
    <>
      <PageHeader title="Activity" description="Who changed what, and when. Kept as part of your compliance record and included in the evidence pack." />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState icon={History} title="Nothing yet" description="Changes to settings, notices, the team and billing will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Area</th>
                  <th scope="col">What happened</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={String(e._id)}>
                    <td className="whitespace-nowrap text-xs text-mist">{formatDateTime(e.createdAt!)}</td>
                    <td className="whitespace-nowrap text-xs">{e.actorName}</td>
                    <td className="whitespace-nowrap text-xs text-mist">{AREA[e.action.split(".")[0]] ?? "Other"}</td>
                    <td className="text-sm">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(page > 1 || entries.length > PAGE_SIZE) && (
          <nav aria-label="Pagination" className="flex justify-between border-t border-line px-6 py-4 text-xs">
            {page > 1 ? <Link href={`/dashboard/activity?page=${page - 1}`} className="text-fog hover:text-paper">Newer</Link> : <span />}
            {entries.length > PAGE_SIZE && <Link href={`/dashboard/activity?page=${page + 1}`} className="text-fog hover:text-paper">Older</Link>}
          </nav>
        )}
      </Panel>
    </>
  );
}
