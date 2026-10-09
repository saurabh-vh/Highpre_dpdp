import { AppWindow, Laptop } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { RevokeDeviceButton } from "@/features/agent/agent-controls";
import { AGENT_PLATFORMS, isDesktopPlatform } from "@/lib/agent/catalog";
import { deviceOwnerLabel } from "@/lib/agent/ingest";
import { isStale } from "@/lib/agent/usage";
import { agentManifest, newerVersion } from "@/lib/agent/update";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { relativeDays } from "@/lib/format";
import { AgentDevice, User } from "@/models";

export const metadata = { title: "Computers · Desktop agent" };

const ONLINE_MS = 40 * 60_000;

export default async function AgentComputersPage() {
  const { org, user, role } = await requireAuth();
  const manager = can(role, "team");
  const scope = manager ? { orgId: org._id } : { orgId: org._id, userId: user.id };

  const [devices, manifest] = await Promise.all([
    AgentDevice.find({ ...scope, revokedAt: { $exists: false } }).sort({ lastSeenAt: -1, createdAt: -1 }).lean(),
    agentManifest(),
  ]);
  const users = await User.find({ _id: { $in: [...new Set(devices.flatMap((d) => (d.userId ? [String(d.userId)] : [])))] } }).select("name").lean();
  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  const latest = manifest?.updatesSigned ? manifest.version : null;
  const now = Date.now();
  const staleCount = devices.filter((d) => isStale(d, now)).length;

  return (
    <Panel>
      <PanelHeader
        title={manager ? "Computers" : "Your computers"}
        description={`Every computer with HighPre. Remove one to switch it off.${latest ? ` Updates install by themselves (latest ${latest}).` : ""}`}
      />
      {staleCount > 0 && (
        <PanelBody className="pb-0">
          <Callout tone="warning">
            {staleCount === 1 ? "1 computer hasn't" : `${staleCount} computers haven't`} checked in for a week. Check that it&rsquo;s switched on and HighPre is still installed.
          </Callout>
        </PanelBody>
      )}
      {devices.length === 0 ? (
        <EmptyState icon={Laptop} title="No computers yet" description="Download HighPre from Get started to protect your first computer." />
      ) : (
        <ul className="divide-y divide-white/[0.08]">
          {devices.map((d) => {
            const online = d.lastSeenAt && now - d.lastSeenAt.getTime() < ONLINE_MS;
            const Icon = d.platform === "browser" ? AppWindow : Laptop;
            const outdated = latest && isDesktopPlatform(d.platform) && d.agentVersion && newerVersion(latest, d.agentVersion);
            return (
              <li key={String(d._id)} className="flex flex-wrap items-center gap-4 px-6 py-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
                  <Icon className="size-4 text-fog" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{d.hostname || "Waiting for first check-in"}</span>
                  <span className="block truncate text-xs text-mist">
                    {deviceOwnerLabel(d, d.userId ? userName.get(String(d.userId)) : undefined)} ·{" "}
                    {d.platform === "browser" ? "Browser extension" : d.osVersion || AGENT_PLATFORMS[d.platform as keyof typeof AGENT_PLATFORMS]?.label}
                    {d.agentVersion ? ` · v${d.agentVersion}` : ""}
                  </span>
                </span>
                {d.enrolled && <Badge>Company install</Badge>}
                {outdated && <Badge tone="info">Update pending</Badge>}
                {d.uninstalledAt ? (
                  <Badge tone="danger">Removed by the user</Badge>
                ) : !d.lastSeenAt ? (
                  <Badge>Downloaded {relativeDays(d.createdAt!)}</Badge>
                ) : isStale(d, now) ? (
                  <Badge tone="danger">Not checking in · last seen {relativeDays(d.lastSeenAt)}</Badge>
                ) : online ? (
                  <Badge tone="success">Active</Badge>
                ) : (
                  <Badge tone="warning">Last seen {relativeDays(d.lastSeenAt)}</Badge>
                )}
                <RevokeDeviceButton deviceId={String(d._id)} name={d.hostname || "this computer"} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
