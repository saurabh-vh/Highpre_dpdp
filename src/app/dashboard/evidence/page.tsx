import { Download, FileCheck2, FileSpreadsheet, Lock } from "lucide-react";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { Site } from "@/models";

export const metadata = { title: "Evidence pack" };

const CONTENTS = [
  "Your grievance contact, response time and team",
  "Every website's purposes, data and retention periods",
  "Every published notice version, with languages",
  "Consent statistics and a tamper check of the consent ledger",
  "Data requests and how many were answered on time",
  "Breaches, with the 72-hour report timeline",
  "Account activity: who changed what, and when",
];

const isoDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export default async function EvidencePage() {
  const { org, role, plan } = await requireAuth();
  const sites = await Site.find({ orgId: org._id }).select("name").sort({ createdAt: 1 }).lean();
  const now = new Date();
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000);

  return (
    <>
      <PageHeader
        title="Evidence pack"
        description="A single PDF that shows how you meet DPDP: for the Data Protection Board, an auditor, or a large client's vendor review."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel>
          <PanelHeader title="Download the PDF" icon={<FileCheck2 className="size-4" aria-hidden />} />
          <PanelBody>
            {plan.features.evidencePack ? (
              // A plain GET form: the browser downloads the file directly.
              <form action="/dashboard/evidence/pdf" method="get" className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]">
                <Field label="From" name="from">
                  <Input type="date" defaultValue={isoDay(yearAgo)} max={isoDay(now)} />
                </Field>
                <Field label="To" name="to">
                  <Input type="date" defaultValue={isoDay(now)} max={isoDay(now)} />
                </Field>
                <button type="submit" className={buttonClasses("primary", "md")}>
                  <Download className="size-4" aria-hidden />
                  Download PDF
                </button>
              </form>
            ) : (
              <Callout
                tone="info"
                title={`The evidence pack is included in paid plans`}
                action={can(role, "billing") && <ButtonLink href="/dashboard/billing" size="sm"><Lock className="size-3.5" aria-hidden />See plans</ButtonLink>}
              >
                Your consent records are always available as CSV below, on every plan.
              </Callout>
            )}
            <h3 className="mb-3 mt-8 text-xs font-medium text-fog">What&apos;s inside</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {CONTENTS.map((c) => (
                <li key={c} className="flex gap-2 text-xs text-mist">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-mist" />
                  {c}
                </li>
              ))}
            </ul>
          </PanelBody>
        </Panel>

        <Panel className="self-start">
          <PanelHeader title="Raw consent records" description="The full ledger for each website as CSV, including each record's hash." icon={<FileSpreadsheet className="size-4" aria-hidden />} />
          {sites.length === 0 ? (
            <PanelBody><p className="text-xs text-mist">Add a website first.</p></PanelBody>
          ) : (
            <ul className="divide-y divide-white/[0.08]">
              {sites.map((s) => (
                <li key={String(s._id)} className="flex items-center justify-between gap-3 px-6 py-3.5">
                  <span className="truncate text-sm">{s.name}</span>
                  <ButtonLink href={`/dashboard/sites/${s._id}/consents/export`} variant="secondary" size="sm" prefetch={false}>
                    <Download className="size-3.5" aria-hidden />
                    CSV
                  </ButtonLink>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
