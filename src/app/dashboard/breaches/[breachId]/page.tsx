import { notFound } from "next/navigation";
import { Types } from "mongoose";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { BreachSteps } from "@/features/breaches/breach-steps";
import { requireAuth } from "@/lib/auth/guards";
import { dataCategoryLabel } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { Breach } from "@/models";

export const metadata = { title: "Breach" };

export default async function BreachDetailPage({ params }: { params: Promise<{ breachId: string }> }) {
  const { breachId } = await params;
  const { org } = await requireAuth();
  if (!Types.ObjectId.isValid(breachId)) notFound();
  const breach = await Breach.findOne({ _id: breachId, orgId: org._id }).lean();
  if (!breach) notFound();

  const hoursLeft = Math.ceil((breach.reportDueAt.getTime() - Date.now()) / 3_600_000);
  const reportDone = breach.steps.some((s) => s.key === "detailed_report" && s.doneAt);
  const categories = breach.dataCategories.map(dataCategoryLabel).join(", ") || "[types of data]";
  const business = org.legalName || org.name;

  const principalNotice = `Subject: Important: a security incident involving your data

Dear [name],

On ${formatDateTime(breach.discoveredAt)} we found that ${breach.title.charAt(0).toLowerCase() + breach.title.slice(1)}. The data involved may include: ${categories}.

What this could mean for you: [likely consequences, e.g. unwanted calls or phishing emails].

What we have done: [steps taken to contain the incident and reduce harm].

What you can do: [practical steps, e.g. be cautious of unexpected messages asking for OTPs or payments].

If you have questions, contact ${org.grievanceOfficerName || "[grievance officer]"} at ${org.grievanceEmail || "[email]"}${org.grievancePhone ? ` or ${org.grievancePhone}` : ""}.

${business}`;

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/breaches", label: "Breaches" }}
        eyebrow={<span className="font-mono">{breach.reference}</span>}
        title={breach.title}
        actions={
          breach.closedAt ? (
            <Badge tone="success">Closed {formatDateTime(breach.closedAt)}</Badge>
          ) : reportDone ? (
            <Badge tone="info">Detailed report sent</Badge>
          ) : (
            <Badge tone={hoursLeft > 24 ? "warning" : "danger"}>{hoursLeft > 0 ? `Report due in ${hoursLeft} hours` : `Report overdue by ${Math.abs(hoursLeft)} hours`}</Badge>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Response checklist" description={`Detailed report to the Board due ${formatDateTime(breach.reportDueAt)}.`} />
            <BreachSteps
              breachId={String(breach._id)}
              steps={breach.steps.map((s) => ({ key: s.key, doneAt: s.doneAt?.toISOString() ?? null }))}
              closed={Boolean(breach.closedAt)}
            />
          </Panel>
          <Panel>
            <PanelHeader title="Message to affected people" description="A starting draft. Fill in the brackets and have it checked before sending." action={<CopyButton value={principalNotice} />} />
            <PanelBody>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fog">{principalNotice}</pre>
            </PanelBody>
          </Panel>
        </div>
        <Panel className="self-start">
          <PanelHeader title="Incident" />
          <PanelBody>
            <dl className="space-y-4 text-sm">
              <div><dt className="text-xs text-mist">Found</dt><dd className="mt-1">{formatDateTime(breach.discoveredAt)}</dd></div>
              <div><dt className="text-xs text-mist">Severity</dt><dd className="mt-1 capitalize">{breach.severity}</dd></div>
              <div><dt className="text-xs text-mist">People affected</dt><dd className="mt-1">{breach.affectedCount ?? "Unknown"}</dd></div>
              <div><dt className="text-xs text-mist">Data involved</dt><dd className="mt-1">{breach.dataCategories.map(dataCategoryLabel).join(", ") || "Not specified"}</dd></div>
              {breach.description && <div><dt className="text-xs text-mist">Details</dt><dd className="mt-1 whitespace-pre-wrap">{breach.description}</dd></div>}
            </dl>
          </PanelBody>
        </Panel>
      </div>
    </>
  );
}
