import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopyButton } from "@/components/ui/copy-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { FormSettings } from "@/features/forms/form-settings";
import { requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formAttributeSnippet, formsConfig, suggestedFormPurposes } from "@/lib/consent/forms";
import { isTracking } from "@/lib/constants";
import { formatDateTime, formatNumber } from "@/lib/format";
import { ConsentRecord, Scan } from "@/models";

export const metadata = { title: "Forms" };

const DAY = 86_400_000;

export default async function FormsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [{ role }, site] = await Promise.all([requireAuth(), requireSite(siteId)]);
  const since = new Date(Date.now() - 30 * DAY);

  const [scan, perForm] = await Promise.all([
    site.lastScanId ? Scan.findById(site.lastScanId).select("forms createdAt").lean() : null,
    ConsentRecord.aggregate<{ _id: string; n: number; last: Date; withAll: number }>([
      { $match: { siteId: site._id, source: "form", createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$formId",
          n: { $sum: 1 },
          last: { $max: "$createdAt" },
          // Submissions where every box shown was ticked.
          withAll: { $sum: { $cond: [{ $allElementsTrue: [{ $map: { input: "$decisions", as: "d", in: "$$d.granted" } }] }, 1, 0] } },
        },
      },
      { $sort: { n: -1 } },
      { $limit: 50 },
    ]),
  ]);

  const purposes = site.purposes.map((p) => ({ key: p.key, name: p.name, essential: p.essential, tracking: isTracking(p) }));
  const settings = {
    autoProtect: Boolean(site.forms?.autoProtect),
    purposes: [...(site.forms?.purposes ?? [])],
    requiredPurposes: [...(site.forms?.requiredPurposes ?? [])],
  };
  const live = formsConfig(purposes, settings);
  const suggested = suggestedFormPurposes(purposes, settings);
  const published = (site.publishedNoticeVersion ?? 0) > 0;
  const snippet = formAttributeSnippet(suggested.length ? suggested : ["purpose_key"], live.required);
  const example = `${snippet}
  <input name="name" autocomplete="name">
  <input name="email" type="email">
  <button type="submit">Send</button>
</form>`;
  const total = perForm.reduce((s, f) => s + f.n, 0);

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Consent on your forms"
          description="Contact, enquiry and sign-up forms collect personal data too. The banner script adds a consent checkbox for each purpose just above the submit button, in the visitor's language, and records every submission in your consent ledger."
          action={live.auto ? <Badge tone="success">Automatic protection on</Badge> : <Badge tone="muted">Marked forms only</Badge>}
        />
        <PanelBody className="space-y-4">
          {!published && (
            <Callout tone="warning" action={<ButtonLink href={`/dashboard/sites/${site.id}/notice`} size="sm" variant="secondary">Publish notice</ButtonLink>}>
              Form checkboxes appear once your privacy notice is published, so each one can link to it.
            </Callout>
          )}
          <p className="text-xs text-mist">
            With the banner script installed, add <code className="font-mono text-paper">data-hp-consent</code> to a form, listing the purpose keys to ask about. Add{" "}
            <code className="font-mono text-paper">data-hp-required</code> for boxes that must be ticked before the form sends. Leave{" "}
            <code className="font-mono text-paper">data-hp-consent</code> empty to use the purposes chosen below, or set it to <code className="font-mono text-paper">off</code> to skip a form.
          </p>
          <div className="flex flex-col gap-3 rounded-field bg-black/50 p-4 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-fog">{snippet}</code>
            <CopyButton value={snippet} label="Copy attribute" />
          </div>
          <details className="rounded-field border border-line px-4 py-3">
            <summary className="cursor-pointer text-xs text-fog">Full example and storing proof with each lead</summary>
            <div className="mt-4 space-y-3 text-xs text-mist">
              <pre className="overflow-x-auto rounded-field bg-black/50 p-4 font-mono leading-relaxed text-fog">{example}</pre>
              <p>
                Each submission also sends a hidden field, <code className="font-mono text-paper">hp_consent_id</code>, holding the receipt id of the consent record. Save it with the lead in
                your CRM or inbox: it&apos;s your proof of what this person agreed to, and you can find the record under Consent records.
              </p>
              <div className="flex items-center gap-3">
                <code className="font-mono text-paper">hp_consent_id</code>
                <CopyButton value="hp_consent_id" label="Copy field name" />
              </div>
              <p>
                Forms sent by JavaScript work too, as long as they fire a normal submit event (a submit button, <code className="font-mono text-paper">form.requestSubmit()</code>). The checkboxes
                have no <code className="font-mono text-paper">name</code>, so your backend only receives the receipt id. Listen for the{" "}
                <code className="font-mono text-paper">highpre:form-consent</code> event on <code className="font-mono text-paper">window</code> to read the receipt id in your own code.
              </p>
              <p>Your purpose keys: {purposes.map((p) => <code key={p.key} className="mr-2 font-mono text-paper">{p.key}</code>)}</p>
            </div>
          </details>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Purposes on forms" description="Used by automatic protection and by forms marked with an empty data-hp-consent. Boxes are never pre-ticked." />
        <PanelBody>
          <FormSettings siteId={site.id} purposes={purposes} settings={settings} readOnly={!can(role, "content.edit")} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Forms found on your website"
          description={scan ? `From the scan on ${formatDateTime(scan.createdAt!)}. Add the suggested attribute to each form's opening tag.` : "Run a scan to find the forms on your website."}
        />
        {!scan || scan.forms.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No forms found" description={scan ? "The last scan didn't find forms asking for personal data. You can still mark forms by hand." : "Scan your website to list the forms that collect personal data."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Page</th>
                  <th scope="col">Asks for</th>
                  <th scope="col">Suggested attribute</th>
                </tr>
              </thead>
              <tbody>
                {scan.forms.map((f, i) => {
                  const attr = suggested.length ? `data-hp-consent="${suggested.join(",")}"` : 'data-hp-consent=""';
                  return (
                    <tr key={`${f.page}-${i}`}>
                      <td className="max-w-[16rem] truncate font-mono text-xs">{f.page ?? "—"}</td>
                      <td className="text-xs">{f.fields.join(", ")}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs text-fog">{attr}</code>
                          <CopyButton value={attr} label="Copy" />
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

      <Panel>
        <PanelHeader title="Form consents, last 30 days" description={`${formatNumber(total)} submissions recorded from your forms.`} />
        {perForm.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No form consents yet" description="Records appear here as soon as someone submits a form with the consent checkboxes." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Form</th>
                  <th scope="col">Submissions</th>
                  <th scope="col">Ticked every box</th>
                  <th scope="col">Last</th>
                </tr>
              </thead>
              <tbody>
                {perForm.map((f) => (
                  <tr key={f._id}>
                    <td className="font-mono text-xs">{f._id}</td>
                    <td className="tabular-nums">{formatNumber(f.n)}</td>
                    <td className="tabular-nums text-xs text-mist">{formatNumber(f.withAll)}</td>
                    <td className="whitespace-nowrap text-xs text-mist">{formatDateTime(f.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
