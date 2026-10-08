import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { requireAuth } from "@/lib/auth/guards";
import { formatDateTime } from "@/lib/format";
import { Breach } from "@/models";

export const metadata = { title: "Breaches" };

export default async function BreachesPage() {
  const { org } = await requireAuth();
  const breaches = await Breach.find({ orgId: org._id }).sort({ discoveredAt: -1 }).limit(100).lean();

  return (
    <>
      <PageHeader
        title="Breaches"
        description="If personal data leaks, log it here straight away. The checklist walks you through reporting within 72 hours."
        actions={<ButtonLink href="/dashboard/breaches/new">Report a breach</ButtonLink>}
      />
      <Panel>
        {breaches.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No incidents logged" description="Good. If something goes wrong, log it here first so the reporting clock and checklist start immediately." />
        ) : (
          <ul className="divide-y divide-white/[0.08]">
            {breaches.map((b) => {
              const doneSteps = b.steps.filter((s) => s.doneAt).length;
              return (
                <li key={String(b._id)}>
                  <Link href={`/dashboard/breaches/${b._id}`} className="flex flex-wrap items-center gap-4 px-6 py-5 transition-colors hover:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{b.title}</p>
                      <p className="text-xs text-mist">Found {formatDateTime(b.discoveredAt)}, {b.reference}</p>
                    </div>
                    <span className="text-xs tabular-nums text-mist">{doneSteps}/{b.steps.length} steps</span>
                    {b.closedAt ? <Badge tone="success">Closed</Badge> : b.reportDueAt < new Date() && !b.steps.some((s) => s.key === "detailed_report" && s.doneAt) ? <Badge tone="danger">Report overdue</Badge> : <Badge tone="warning">Open</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
