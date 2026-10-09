import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { AgentPolicyForm } from "@/features/agent/agent-controls";
import { AGENT_APPS, AGENT_DATA_TYPES } from "@/lib/agent/catalog";
import { getAgentPolicy } from "@/lib/agent/policy";
import { requirePagePermission } from "@/lib/auth/guards";
import { AgentAlert } from "@/models";

export const metadata = { title: "Settings · Desktop agent" };

/** What every computer looks for. Owners and admins only. */
export default async function AgentSettingsPage() {
  const { org } = await requirePagePermission("team");
  const [policy, typeStats] = await Promise.all([
    getAgentPolicy(org._id),
    AgentAlert.aggregate<{ _id: string; total: number; falseAlarms: number }>([
      { $match: { orgId: org._id, createdAt: { $gte: new Date(Date.now() - 90 * 86_400_000) } } },
      { $group: { _id: "$dataType", total: { $sum: 1 }, falseAlarms: { $sum: { $cond: [{ $ifNull: ["$notSensitiveAt", false] }, 1, 0] } } } },
    ]),
  ]);
  const stats = new Map(typeStats.map((s) => [s._id, s]));

  return (
    <Panel>
      <PanelHeader title="What to look for" description="Changes reach every computer within 15 minutes." />
      <PanelBody>
        <AgentPolicyForm
          value={policy}
          dataTypes={Object.entries(AGENT_DATA_TYPES).map(([value, d]) => {
            const s = stats.get(value);
            const hint = !s ? "No alerts yet" : `${s.total} alert${s.total === 1 ? "" : "s"} · ${Math.round((s.falseAlarms / s.total) * 100)}% false alarms`;
            return { value, label: d.label, hint };
          })}
          apps={Object.entries(AGENT_APPS).map(([value, a]) => ({ value, label: a.label }))}
        />
      </PanelBody>
    </Panel>
  );
}
