import Link from "next/link";
import { ChevronRight, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { scoreColor } from "@/components/ui/progress-ring";
import { AddSiteForm } from "@/features/sites/add-site-form";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { readinessScore, siteChecklist } from "@/lib/compliance/checklist";
import { hostnameOf } from "@/lib/format";
import { Site } from "@/models";

export const metadata = { title: "Websites" };

export default async function SitesPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { org, role, plan } = await requireAuth();
  const { welcome } = await searchParams;
  const sites = await Site.find({ orgId: org._id }).sort({ createdAt: 1 }).lean();
  const canAdd = can(role, "sites.manage");
  const atLimit = sites.length >= plan.limits.sites;

  return (
    <>
      <PageHeader
        title={welcome ? "Welcome to HighPre" : "Websites"}
        description={
          welcome
            ? "Start by adding the website you want to make DPDP-ready. We'll scan it straight away and guide you through four short steps."
            : `Each website gets its own notice, consent banner and records. ${sites.length} of ${plan.limits.sites} on the ${plan.name} plan.`
        }
      />

      {canAdd && (
        <Panel className="mb-6">
          <PanelHeader title="Add a website" />
          <PanelBody>
            {atLimit ? (
              <Callout
                tone="info"
                title={`You've used all ${plan.limits.sites} website${plan.limits.sites > 1 ? "s" : ""} on the ${plan.name} plan`}
                action={can(role, "billing") && <ButtonLink href="/dashboard/billing" size="sm">See plans</ButtonLink>}
              >
                Upgrade to add more websites.
              </Callout>
            ) : (
              <AddSiteForm />
            )}
          </PanelBody>
        </Panel>
      )}

      {sites.length === 0 ? (
        !canAdd && (
          <Panel>
            <EmptyState icon={Globe} title="No websites yet" description="An owner or admin can add your first website." />
          </Panel>
        )
      ) : (
        <Panel>
          <ul className="divide-y divide-white/[0.08]">
            {sites.map((site) => {
              const checklist = siteChecklist({ ...site, id: String(site._id) });
              const score = readinessScore(checklist);
              const done = checklist.filter((c) => c.done).length;
              return (
                <li key={String(site._id)}>
                  <Link href={`/dashboard/sites/${site._id}`} className="group flex items-center gap-5 px-6 py-5 transition-colors hover:bg-white/[0.03]">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
                      <Globe className="size-4 text-fog" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{site.name}</p>
                      <p className="truncate text-xs text-mist">{hostnameOf(site.url)}</p>
                    </div>
                    <div className="hidden items-center gap-2 md:flex">
                      {(site.publishedNoticeVersion ?? 0) > 0 ? <Badge tone="success">Notice v{site.publishedNoticeVersion}</Badge> : <Badge tone="warning">No notice</Badge>}
                      {site.widgetLastSeenAt ? <Badge tone="success">Banner live</Badge> : <Badge>Banner not installed</Badge>}
                    </div>
                    <div className="w-28 shrink-0">
                      <div className="flex justify-between text-2xs text-mist">
                        <span>{done} of {checklist.length} steps</span>
                        <span className="font-medium tabular-nums text-paper">{score}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                        <div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }} />
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-mist transition-transform duration-300 ease-apple group-hover:translate-x-0.5" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}
