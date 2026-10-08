import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { InviteActions, InviteForm, RemoveMemberButton, RoleSelect } from "@/features/team/team-controls";
import { requireAuth } from "@/lib/auth/guards";
import { ROLE_LABELS, can } from "@/lib/auth/permissions";
import { getUsage } from "@/lib/billing/usage";
import { formatDate, relativeDays } from "@/lib/format";
import { Invite, User } from "@/models";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const { org, user, role, plan } = await requireAuth();
  const manage = can(role, "team");
  const [users, invites, usage] = await Promise.all([
    User.find({ _id: { $in: org.members.map((m) => m.userId) } }).select("name email lastLoginAt twoFactorEnabled").lean(),
    manage ? Invite.find({ orgId: org._id, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean() : [],
    getUsage(org),
  ]);
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const atLimit = usage.seats >= plan.limits.seats;

  return (
    <>
      <PageHeader
        title="Team"
        description={`Everyone who can work on ${org.name}. ${usage.seats} of ${plan.limits.seats} seats used on the ${plan.name} plan.`}
      />
      <div className="space-y-6">
        {manage && (
          <Panel>
            <PanelHeader title="Invite a teammate" description="They'll get an email with a link to join. Invitations expire after 7 days." />
            <PanelBody>
              {atLimit ? (
                <Callout tone="warning" title="All seats are in use" action={can(role, "billing") && <ButtonLink href="/dashboard/billing" size="sm">See plans</ButtonLink>}>
                  Your {plan.name} plan includes {plan.limits.seats} seat{plan.limits.seats > 1 ? "s" : ""}. Upgrade, or remove someone, to invite more people.
                </Callout>
              ) : (
                <InviteForm />
              )}
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader title="Members" />
          <ul className="divide-y divide-white/[0.08]">
            {org.members.map((m) => {
              const u = byId.get(String(m.userId));
              const self = String(m.userId) === user.id;
              return (
                <li key={String(m.userId)} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xs font-semibold uppercase">
                    {(u?.name ?? "?").slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      {u?.name ?? "Unknown user"} {self && <span className="text-mist">(you)</span>}
                      {u?.twoFactorEnabled ? (
                        <Badge tone="success" className="ml-2 h-5 align-middle">2FA</Badge>
                      ) : (
                        manage && <Badge tone="muted" className="ml-2 h-5 align-middle">No 2FA</Badge>
                      )}
                    </span>
                    <span className="block truncate text-xs text-mist">
                      {u?.email}
                      {u?.lastLoginAt ? ` · last active ${relativeDays(u.lastLoginAt)}` : ""}
                    </span>
                  </span>
                  {manage && !self ? (
                    <RoleSelect userId={String(m.userId)} role={m.role} canEditOwner={role === "owner"} />
                  ) : (
                    <Badge tone={m.role === "owner" ? "solid" : "outline"}>{ROLE_LABELS[m.role]}</Badge>
                  )}
                  {(self || (manage && (m.role !== "owner" || role === "owner"))) && (
                    <RemoveMemberButton userId={String(m.userId)} name={u?.name ?? "this member"} self={self} />
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        {manage && invites.length > 0 && (
          <Panel>
            <PanelHeader title="Pending invitations" />
            <ul className="divide-y divide-white/[0.08]">
              {invites.map((inv) => (
                <li key={String(inv._id)} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{inv.email}</span>
                    <span className="block text-xs text-mist">
                      {ROLE_LABELS[inv.role]} · expires {formatDate(inv.expiresAt)}
                    </span>
                  </span>
                  <Badge tone="warning">Pending</Badge>
                  <InviteActions inviteId={String(inv._id)} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </>
  );
}
