import Link from "next/link";
import { AppWindow, Laptop, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import {
  AcknowledgeButton,
  AgentDownloads,
  AgentPolicyForm,
  CompanyInstall,
  NotSensitiveButton,
  RevokeDeviceButton,
} from "@/features/agent/agent-controls";
import { AGENT_APPS, AGENT_DATA_TYPES, AGENT_PLATFORMS, ALERT_OUTCOMES, appCategoryLabel, appLabel, dataTypeLabel, isDesktopPlatform, type AlertOutcome } from "@/lib/agent/catalog";
import { deviceOwnerLabel } from "@/lib/agent/ingest";
import { getAgentPolicy } from "@/lib/agent/policy";
import { agentManifest, newerVersion } from "@/lib/agent/update";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDateTime, relativeDays } from "@/lib/format";
import { AgentAlert, AgentDevice, User } from "@/models";

export const metadata = { title: "Desktop agent" };

const ONLINE_MS = 40 * 60_000;

const OUTCOME_TONE: Record<AlertOutcome, "danger" | "warning" | "success" | undefined> = {
  warned: "warning",
  stopped: "success",
  blocked: "success",
  sent_anyway: "danger",
  not_sensitive: undefined,
};

export default async function AgentPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { org, user, role } = await requireAuth();
  const { show } = await searchParams;
  const manager = can(role, "team");
  const scope = manager ? { orgId: org._id } : { orgId: org._id, userId: user.id };
  const showAll = show === "all";

  const [devices, alerts, openCount, policy, manifest, typeStats] = await Promise.all([
    AgentDevice.find({ ...scope, revokedAt: { $exists: false } }).sort({ lastSeenAt: -1, createdAt: -1 }).lean(),
    AgentAlert.find({ ...scope, ...(showAll ? {} : { acknowledgedAt: { $exists: false } }) }).sort({ lastOccurredAt: -1 }).limit(200).lean(),
    AgentAlert.countDocuments({ ...scope, acknowledgedAt: { $exists: false } }),
    getAgentPolicy(org._id),
    agentManifest(),
    manager
      ? AgentAlert.aggregate<{ _id: string; total: number; falseAlarms: number }>([
          { $match: { orgId: org._id, createdAt: { $gte: new Date(Date.now() - 90 * 86_400_000) } } },
          { $group: { _id: "$dataType", total: { $sum: 1 }, falseAlarms: { $sum: { $cond: [{ $ifNull: ["$notSensitiveAt", false] }, 1, 0] } } } },
        ])
      : [],
  ]);
  const deviceIds = new Set(devices.map((d) => String(d._id)));
  const alertDevices = await AgentDevice.find({ _id: { $in: alerts.map((a) => a.deviceId).filter((id) => !deviceIds.has(String(id))) } }).lean();
  const allDevices = [...devices, ...alertDevices];
  const users = await User.find({ _id: { $in: [...new Set([...allDevices, ...alerts].flatMap((d) => (d.userId ? [String(d.userId)] : [])))] } }).select("name").lean();
  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  const deviceById = new Map(allDevices.map((d) => [String(d._id), d]));
  const ownerOf = (d: { userId?: unknown; osUser?: string | null; enrolled?: boolean | null }) => deviceOwnerLabel(d, d.userId ? userName.get(String(d.userId)) : undefined);
  const stats = new Map(typeStats.map((s) => [s._id, s]));
  const latest = manifest?.updatesSigned ? manifest.version : null;
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Desktop agent"
        description="Stops passwords, keys, card numbers and ID numbers from being pasted into AI assistants and chat apps by mistake. Detection runs on each computer and in each browser; HighPre only learns what kind of data, which app and what the person chose."
      />

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Install on your computer" description="Each download is linked to you. Use the desktop agent, the browser extension, or both." />
          <PanelBody className="space-y-5">
            <AgentDownloads />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-field border border-line p-4">
                <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-success" aria-hidden />What it does</p>
                <ul className="mt-2 space-y-1.5 text-xs text-mist">
                  <li>Looks for passwords, API keys, private keys, card and bank details, Aadhaar, PAN, passport numbers and customer lists.</li>
                  <li><strong className="font-medium text-fog">Desktop agent:</strong> warns when that&apos;s on the clipboard while ChatGPT, Claude, Gemini, Copilot, WhatsApp, Slack or a similar app is open.</li>
                  <li><strong className="font-medium text-fog">Browser extension:</strong> asks before it&apos;s pasted, dropped or sent on those sites, typed messages included.</li>
                  <li>Owners get an email and see the alert here: who, which computer, what kind of data, which app, and what they chose.</li>
                </ul>
              </div>
              <div className="rounded-field border border-line p-4">
                <p className="flex items-center gap-2 text-sm font-medium"><ShieldOff className="size-4 text-info" aria-hidden />What it never does</p>
                <ul className="mt-2 space-y-1.5 text-xs text-mist">
                  <li>Never sends the text, or anything derived from it, to HighPre.</li>
                  <li>Doesn&apos;t record keystrokes, screenshots, browsing history or window titles. The extension runs only on the sites it protects.</li>
                  <li>Installs for one user without admin rights and can be removed from Settings → Apps (Windows), with the uninstaller (Mac) or from the browser&apos;s extensions page.</li>
                </ul>
              </div>
            </div>
            <Callout tone="info">
              Tell your team before they install it: it tells people when they&apos;re warned, and owners see those warnings. On macOS, right-click the installer and choose Open the first time. The extension zip has install steps inside.
            </Callout>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title={manager ? "Leak alerts" : "Your alerts"}
            description={showAll ? "All alerts." : `${openCount} waiting for review.`}
            action={
              <div className="flex items-center gap-2">
                <Link href={showAll ? "/dashboard/agent" : "/dashboard/agent?show=all"} className="text-xs text-mist hover:text-paper">
                  {showAll ? "Show open only" : "Show all"}
                </Link>
                {manager && openCount > 0 && <AcknowledgeButton alertId="all" label="Mark all reviewed" />}
              </div>
            }
          />
          {alerts.length === 0 ? (
            <EmptyState icon={ShieldCheck} title={showAll ? "No alerts yet" : "Nothing to review"} description="Alerts appear here when sensitive data heads for an AI or chat app." />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">Data</th>
                    <th scope="col">App</th>
                    <th scope="col">What happened</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const device = deviceById.get(String(a.deviceId));
                    const outcome = (a.outcome ?? "warned") as AlertOutcome;
                    const mine = a.userId && String(a.userId) === user.id;
                    return (
                      <tr key={String(a._id)}>
                        <td className="whitespace-nowrap text-xs text-mist">
                          {formatDateTime(a.lastOccurredAt)}
                          {a.count > 1 && <span className="block">{a.count} times</span>}
                        </td>
                        <td className="text-xs">
                          {device ? ownerOf(device) : a.userId ? (userName.get(String(a.userId)) ?? "Former member") : "Company install"}
                          <span className="block text-mist">{device?.hostname || "Removed device"}</span>
                        </td>
                        <td><Badge tone={a.severity === "high" ? "danger" : "warning"}>{dataTypeLabel(a.dataType)}</Badge></td>
                        <td className="text-xs">
                          {appLabel(a.app)}
                          <span className="block text-mist">{appCategoryLabel(a.app)} · {a.source === "extension" ? "browser" : "desktop"}</span>
                        </td>
                        <td className="text-xs">
                          <Badge tone={OUTCOME_TONE[outcome]}>{ALERT_OUTCOMES[outcome]}</Badge>
                          {a.notSensitiveAt && outcome !== "not_sensitive" && <span className="mt-1 block text-mist">Later marked not sensitive</span>}
                        </td>
                        <td className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1">
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
          )}
        </Panel>

        {manager && (
          <Panel>
            <PanelHeader
              title="What to watch for"
              description="Applies to every computer and browser in your organisation within 15 minutes. False-alarm rates come from people marking alerts as not sensitive over the last 90 days."
            />
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
        )}

        {manager && (
          <Panel>
            <PanelHeader
              title="Install across your company"
              description="For IT teams: deploy one installer to every computer with Intune, Jamf, Kandji or a sign-in script. Each person's agent registers itself and appears below with the computer and sign-in name."
            />
            <PanelBody>
              <CompanyInstall enabled={policy.enrollmentEnabled} />
              <p className="mt-4 text-2xs text-mist">
                Each zip has deployment steps. Windows installs per user without admin rights{latest ? " and updates itself" : ""}; Mac installs for every user and is updated by redeploying. Anyone with the installer can add computers to your account, so keep it internal and replace the key if it leaks.
              </p>
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader
            title={manager ? "Devices" : "Your devices"}
            description={`Every download and company install appears here. Remove a device to switch it off.${latest ? ` Latest desktop version: ${latest}, installed automatically.` : ""}`}
          />
          {devices.length === 0 ? (
            <EmptyState icon={Laptop} title="No devices yet" description="Download the agent or extension above to protect your first computer." />
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
                        {ownerOf(d)} · {d.platform === "browser" ? "Browser extension" : d.osVersion || AGENT_PLATFORMS[d.platform as keyof typeof AGENT_PLATFORMS]?.label}
                        {d.agentVersion ? ` · v${d.agentVersion}` : ""}
                      </span>
                    </span>
                    {d.enrolled && <Badge>Company install</Badge>}
                    {outdated && <Badge tone="info">Update pending</Badge>}
                    {!d.lastSeenAt ? (
                      <Badge>Downloaded {relativeDays(d.createdAt!)}</Badge>
                    ) : online ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="warning">Last seen {relativeDays(d.lastSeenAt)}</Badge>
                    )}
                    <RevokeDeviceButton deviceId={String(d._id)} name={d.hostname || "this device"} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
