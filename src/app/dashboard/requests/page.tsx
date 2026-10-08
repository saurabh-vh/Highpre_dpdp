import Link from "next/link";
import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { requireAuth } from "@/lib/auth/guards";
import { requestStatusLabel, requestTypeLabel } from "@/lib/constants";
import { formatDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RightsRequest, Site } from "@/models";

export const metadata = { title: "Data requests" };

const daysLeft = (due: Date, now: Date) => Math.ceil((due.getTime() - now.getTime()) / 86_400_000);

const FILTERS = [
  { id: "active", label: "Active", statuses: ["open", "in_progress"] },
  { id: "closed", label: "Closed", statuses: ["resolved", "rejected"] },
  { id: "all", label: "All", statuses: ["open", "in_progress", "resolved", "rejected"] },
] as const;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { org } = await requireAuth();
  const { filter: filterId } = await searchParams;
  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0];

  const [requests, sites] = await Promise.all([
    RightsRequest.find({ orgId: org._id, status: { $in: filter.statuses } }).sort({ dueAt: 1 }).limit(200).lean(),
    Site.find({ orgId: org._id }).select("name").lean(),
  ]);
  const siteName = new Map(sites.map((s) => [String(s._id), s.name]));
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Data requests"
        description={`Requests to access, correct or erase data, sent through your request pages. You've committed to replying within ${org.responseDays} days.`}
      />
      <nav aria-label="Filter requests" className="mb-6 inline-flex gap-1 rounded-full border border-line bg-surface p-1">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/dashboard/requests?filter=${f.id}`}
            aria-current={f.id === filter.id ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300 ease-apple",
              f.id === filter.id ? "bg-paper text-ink" : "text-fog hover:text-paper",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Panel>
        {requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={filter.id === "active" ? "No open requests" : "Nothing here yet"}
            description="Requests arrive here once a visitor verifies their email on your request page. Link to it from your privacy notice."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Request</th>
                  <th scope="col">From</th>
                  <th scope="col">Website</th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const active = r.status === "open" || r.status === "in_progress";
                  const overdue = active && r.dueAt < now;
                  return (
                    <tr key={String(r._id)}>
                      <td>
                        <Link href={`/dashboard/requests/${r._id}`} className="block font-medium hover:underline hover:underline-offset-4">
                          {requestTypeLabel(r.type)}
                        </Link>
                        <span className="font-mono text-2xs text-mist">{r.reference}</span>
                      </td>
                      <td className="text-xs">
                        {r.name}
                        <span className="block text-mist">{r.email}</span>
                      </td>
                      <td className="text-xs text-mist">{siteName.get(String(r.siteId)) ?? "Removed"}</td>
                      <td className="whitespace-nowrap text-xs">
                        {active ? (
                          <span className={cn(overdue ? "font-semibold text-danger" : daysLeft(r.dueAt, now) <= 3 ? "text-warning" : "")}>{overdue ? `Overdue, ${relativeDays(r.dueAt)}` : relativeDays(r.dueAt)}</span>
                        ) : (
                          <span className="text-mist">{formatDate(r.dueAt)}</span>
                        )}
                      </td>
                      <td>
                        <Badge tone={overdue ? "danger" : r.status === "open" ? "info" : r.status === "in_progress" ? "warning" : r.status === "resolved" ? "success" : "muted"}>{overdue ? "Overdue" : requestStatusLabel(r.status)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
