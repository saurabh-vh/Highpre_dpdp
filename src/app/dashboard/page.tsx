import Link from "next/link";
import { ArrowRight, CalendarClock, Globe, Inbox } from "lucide-react";
import { Checklist } from "@/components/dashboard/checklist";
import { ConsentSummaryCard } from "@/components/dashboard/consent-chart";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StatCard } from "@/components/ui/stat-card";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { monthStartIst } from "@/lib/billing/usage";
import { orgChecklist, readinessScore, siteChecklist } from "@/lib/compliance/checklist";
import { consentAnalytics } from "@/lib/consent/analytics";
import { DPDP_DEADLINE } from "@/lib/constants";
import { daysBetween, formatDateTime, formatNumber } from "@/lib/format";
import { vendorCoverage } from "@/lib/vendors/sync";
import { AuditLog, Breach, ConsentRecord, RightsRequest, Site } from "@/models";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const { user, org, role, plan } = await requireAuth();
  const sites = await Site.find({ orgId: org._id }).sort({ createdAt: 1 }).lean();
  const siteIds = sites.map((s) => s._id);
  const now = new Date();

  const [openRequests, overdueRequests, consents30d, openBreaches, consentsThisMonth, recent] = await Promise.all([
    RightsRequest.countDocuments({ orgId: org._id, status: { $in: ["open", "in_progress"] } }),
    RightsRequest.countDocuments({ orgId: org._id, status: { $in: ["open", "in_progress"] }, dueAt: { $lt: now } }),
    consentAnalytics(sites, 30, now),
    Breach.countDocuments({ orgId: org._id, closedAt: { $exists: false } }),
    ConsentRecord.countDocuments({ siteId: { $in: siteIds }, createdAt: { $gte: monthStartIst(now) } }),
    AuditLog.find({ orgId: org._id }).sort({ createdAt: -1 }).limit(6).lean(),
  ]);

  const items = [
    ...orgChecklist(org, { overdueRequests, openBreaches, vendors: await vendorCoverage(org._id) }),
    ...sites.flatMap((s) => siteChecklist({ ...s, id: String(s._id) }).map((i) => ({ ...i, context: s.name }))),
  ];
  const score = readinessScore(items);
  const todo = items.filter((i) => !i.done);
  const ordered = [...todo, ...items.filter((i) => i.done)];
  const next = todo[0];
  const daysLeft = Math.max(0, daysBetween(now, DPDP_DEADLINE));
  const overConsentLimit = consentsThisMonth > plan.limits.consentsPerMonth;

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} description={`Here's where ${org.name} stands on India's DPDP Act.`} />

      {overConsentLimit && (
        <Callout
          tone="warning"
          title="You're over this month's consent limit"
          className="mb-6"
          action={can(role, "billing") && <ButtonLink href="/dashboard/billing" size="sm">See plans</ButtonLink>}
        >
          {formatNumber(consentsThisMonth)} records against {formatNumber(plan.limits.consentsPerMonth)} on the {plan.name} plan. Consent is still being recorded.
        </Callout>
      )}

      {sites.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Globe}
            title="Add your first website"
            description="We'll scan it for forms and trackers, then walk you through the privacy notice and consent banner. It takes about 10 minutes."
            action={<ButtonLink href="/dashboard/sites">Add a website</ButtonLink>}
          />
        </Panel>
      ) : (
        <div className="space-y-6">
          {next ? (
            <Link href={next.href} className="surface group flex flex-col items-start gap-5 rounded-panel p-6 transition-colors hover:border-white/25 sm:flex-row sm:items-center">
              <ProgressRing value={score} size={76} stroke={6} />
              <div className="min-w-0 flex-1 sm:min-w-[16rem]">
                <p className="text-2xs font-medium uppercase tracking-wider text-mist">Next step</p>
                <p className="mt-1 text-lg font-semibold tracking-tight">{next.label}</p>
                <p className="mt-0.5 text-sm text-mist">
                  {"context" in next && sites.length > 1 ? `${next.context}: ` : ""}
                  {next.hint}
                </p>
              </div>
              <span className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-paper px-5 text-sm font-medium text-ink transition-colors group-hover:bg-fog sm:w-auto">
                Continue
                <ArrowRight className="size-4 transition-transform duration-300 ease-apple group-hover:translate-x-0.5" aria-hidden />
              </span>
            </Link>
          ) : (
            <Callout tone="success" title="Everything on your checklist is done">
              Keep replying to requests on time and re-scan your websites after big changes.
            </Callout>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Readiness" value={`${score}%`} note={`${items.length - todo.length} of ${items.length} done`} tone={score >= 80 ? "success" : score >= 50 ? "warning" : "danger"} />
            <StatCard label="Until 13 May 2027" value={`${formatNumber(daysLeft)} days`} icon={CalendarClock} note="When DPDP duties apply" />
            <StatCard
              label="Open data requests"
              value={formatNumber(openRequests)}
              icon={Inbox}
              note={overdueRequests > 0 ? `${overdueRequests} overdue` : openRequests > 0 ? "All on time" : "Nothing waiting"}
              tone={overdueRequests > 0 ? "danger" : "success"}
              href="/dashboard/requests"
            />
            {/* Links to the busiest site's analytics. */}
            <ConsentSummaryCard analytics={consents30d} href={`/dashboard/sites/${consents30d.sites[0]?.siteId ?? String(sites[0]._id)}/analytics?range=30`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <Panel>
              <PanelHeader title="Readiness checklist" description="Each item links to where you can finish it." />
              <PanelBody className="py-2">
                <Checklist items={ordered} context={sites.length > 1} />
              </PanelBody>
            </Panel>

            <Panel className="self-start">
              <PanelHeader
                title="Recent activity"
                action={can(role, "settings") && <Link href="/dashboard/activity" className="text-xs text-mist hover:text-paper">View all</Link>}
              />
              {recent.length === 0 ? (
                <PanelBody><p className="text-xs text-mist">Changes your team makes will show here.</p></PanelBody>
              ) : (
                <ol className="divide-y divide-white/[0.06]">
                  {recent.map((e) => (
                    <li key={String(e._id)} className="px-6 py-3.5">
                      <p className="text-xs leading-relaxed">{e.summary}</p>
                      <p className="mt-0.5 text-2xs text-mist">{e.actorName} · {formatDateTime(e.createdAt!)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
