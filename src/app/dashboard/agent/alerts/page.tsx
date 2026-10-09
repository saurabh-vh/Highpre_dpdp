import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { AcknowledgeButton, NotSensitiveButton } from "@/features/agent/agent-controls";
import { AiToolsCard } from "@/features/agent/ai-tools-card";
import { ALERT_OUTCOMES, alertViaLabel, appLabel, dataTypeLabel, type AlertOutcome } from "@/lib/agent/catalog";
import { deviceOwnerLabel } from "@/lib/agent/ingest";
import { getAgentPolicy } from "@/lib/agent/policy";
import { aiToolTotals } from "@/lib/agent/usage";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/format";
import { AgentAlert, AgentDevice, User } from "@/models";

export const metadata = { title: "Alerts · Desktop agent" };

const PER_PAGE = 20;

const OUTCOME_TONE: Record<AlertOutcome, "danger" | "warning" | "success" | undefined> = {
  warned: "warning",
  stopped: "success",
  blocked: "success",
  sent_anyway: "danger",
  not_sensitive: undefined,
  masked: "success",
};

export default async function AgentAlertsPage({ searchParams }: { searchParams: Promise<{ show?: string; page?: string }> }) {
  const { org, user, role } = await requireAuth();
  const { show, page: pageParam } = await searchParams;
  const manager = can(role, "team");
  const scope = manager ? { orgId: org._id } : { orgId: org._id, userId: user.id };
  const showAll = show === "all";
  const filter = { ...scope, ...(showAll ? {} : { acknowledgedAt: { $exists: false } }) };
  const page = Math.max(1, Number(pageParam) || 1);

  const [alerts, total, openCount, policy, aiTotals] = await Promise.all([
    AgentAlert.find(filter).sort({ lastOccurredAt: -1 }).skip((page - 1) * PER_PAGE).limit(PER_PAGE).lean(),
    AgentAlert.countDocuments(filter),
    AgentAlert.countDocuments({ ...scope, acknowledgedAt: { $exists: false } }),
    manager ? getAgentPolicy(org._id) : null,
    manager ? aiToolTotals(org._id, 30) : null,
  ]);
  const devices = await AgentDevice.find({ _id: { $in: alerts.map((a) => a.deviceId) } }).select("hostname userId osUser enrolled").lean();
  const users = await User.find({ _id: { $in: [...new Set(alerts.flatMap((a) => (a.userId ? [String(a.userId)] : [])))] } }).select("name").lean();
  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  const deviceById = new Map(devices.map((d) => [String(d._id), d]));
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const href = (p: number) => `/dashboard/agent/alerts?${new URLSearchParams({ ...(showAll ? { show: "all" } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      {manager && aiTotals && policy && <AiToolsCard tools={aiTotals.tools} people={aiTotals.people} allowed={policy.allowedApps} enabled={policy.shareAiUsage} />}

      <Panel>
        <PanelHeader
          title={manager ? "Alerts" : "Your alerts"}
          description={showAll ? `${total} in total.` : openCount ? `${openCount} to review.` : "Nothing to review."}
          action={
            <div className="flex items-center gap-2">
              <Link href={showAll ? "/dashboard/agent/alerts" : "/dashboard/agent/alerts?show=all"} className="text-xs text-mist hover:text-paper">
                {showAll ? "Show open only" : "Show all"}
              </Link>
              {manager && openCount > 0 && <AcknowledgeButton alertId="all" label="Mark all reviewed" />}
            </div>
          }
        />
        {alerts.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={showAll ? "No alerts yet" : "All clear"} description="You'll see an alert here if someone copies private data into an AI or chat app." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">Data</th>
                    <th scope="col">Where</th>
                    <th scope="col">What happened</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const device = deviceById.get(String(a.deviceId));
                    const outcome = (a.outcome ?? "warned") as AlertOutcome;
                    const mine = a.userId && String(a.userId) === user.id;
                    const who = device
                      ? deviceOwnerLabel(device, device.userId ? userName.get(String(device.userId)) : undefined)
                      : a.userId
                        ? (userName.get(String(a.userId)) ?? "Former member")
                        : "Company install";
                    return (
                      <tr key={String(a._id)}>
                        <td className="whitespace-nowrap text-xs text-mist">
                          {formatDateTime(a.lastOccurredAt)}
                          {a.count > 1 && <span className="block">{a.count} times</span>}
                        </td>
                        <td className="whitespace-nowrap text-xs">
                          {who}
                          <span className="block max-w-[180px] truncate text-mist">{device?.hostname || "Removed computer"}</span>
                        </td>
                        <td><Badge tone={a.severity === "high" ? "danger" : "warning"}>{dataTypeLabel(a.dataType)}</Badge></td>
                        <td className="text-xs">
                          {appLabel(a.app)}
                          {a.via && <span className="block text-mist">{alertViaLabel(a.via)}</span>}
                        </td>
                        <td className="text-xs">
                          <Badge tone={OUTCOME_TONE[outcome]}>{ALERT_OUTCOMES[outcome]}</Badge>
                          {a.notSensitiveAt && outcome !== "not_sensitive" && <span className="mt-1 block text-mist">Later marked not sensitive</span>}
                        </td>
                        <td className="w-px whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-1">
                            {mine && !a.notSensitiveAt && <NotSensitiveButton alertId={String(a._id)} />}
                            {a.acknowledgedAt ? <Badge tone="success">Reviewed</Badge> : manager && <AcknowledgeButton alertId={String(a._id)} />}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
                <span className="text-xs text-mist">
                  Page {page} of {pages}
                </span>
                <div className="flex gap-2">
                  {page > 1 && <ButtonLink href={href(page - 1)} variant="secondary" size="sm">Newer</ButtonLink>}
                  {page < pages && <ButtonLink href={href(page + 1)} variant="secondary" size="sm">Older</ButtonLink>}
                </div>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
