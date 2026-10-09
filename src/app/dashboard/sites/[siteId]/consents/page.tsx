import Link from "next/link";
import { Download, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { requireSite } from "@/lib/auth/guards";
import { formatDateTime, formatNumber } from "@/lib/format";
import { languageLabel } from "@/lib/i18n/languages";
import { ConsentRecord } from "@/models";

export const metadata = { title: "Consent records" };

const PAGE_SIZE = 50;
const actionLabel = { grant: "Gave consent", update: "Changed choices", withdraw: "Withdrew" } as const;

export default async function ConsentsPage({ params, searchParams }: { params: Promise<{ siteId: string }>; searchParams: Promise<{ page?: string; receipt?: string }> }) {
  const [{ siteId }, sp] = await Promise.all([params, searchParams]);
  const site = await requireSite(siteId);
  const page = Math.max(1, Number(sp.page) || 1);
  // Look up one form submission by the receipt id stored with the lead (hp_consent_id).
  const searching = Boolean(sp.receipt?.trim());
  const receipt = /^[0-9a-f-]{36}$/i.test(sp.receipt?.trim() ?? "") ? sp.receipt!.trim().toLowerCase() : "";

  const [records, totals] = await Promise.all([
    ConsentRecord.find(searching ? { siteId: site._id, receiptId: receipt } : { siteId: site._id }).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE + 1).lean(),
    ConsentRecord.aggregate<{ _id: string; n: number }>([{ $match: { siteId: site._id } }, { $group: { _id: "$action", n: { $sum: 1 } } }]),
  ]);
  const hasNext = records.length > PAGE_SIZE;
  const rows = records.slice(0, PAGE_SIZE);
  const count = (a: string) => totals.find((t) => t._id === a)?.n ?? 0;
  const total = totals.reduce((s, t) => s + t.n, 0);
  const base = `/dashboard/sites/${site.id}/consents`;

  return (
    <Panel>
      <PanelHeader
        title="Consent ledger"
        description={`${formatNumber(total)} records. ${formatNumber(count("grant"))} given, ${formatNumber(count("update"))} changed, ${formatNumber(count("withdraw"))} withdrawn. Records can't be edited.`}
        action={
          total > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <form method="get" action={base} role="search">
                <label htmlFor="receipt" className="sr-only">Find a form receipt id</label>
                <input
                  id="receipt"
                  name="receipt"
                  defaultValue={sp.receipt ?? ""}
                  placeholder="Find receipt id"
                  className="h-8 w-56 rounded-full border border-line bg-transparent px-3 font-mono text-xs placeholder:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                />
              </form>
              <ButtonLink href={`${base}/export`} variant="secondary" size="sm" prefetch={false}>
                <Download className="size-3.5" aria-hidden />
                Export CSV
              </ButtonLink>
            </div>
          )
        }
      />
      {rows.length === 0 ? (
        searching ? (
          <EmptyState icon={ScrollText} title="No record with that receipt id" description="Check the hp_consent_id stored with the lead. Records appear a few seconds after the form is sent." />
        ) : (
          <EmptyState icon={ScrollText} title="No consent records yet" description="Records appear here as soon as visitors make a choice in your banner or submit a form with consent checkboxes." />
        )
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Visitor</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Allowed purposes</th>
                  <th scope="col">Source</th>
                  <th scope="col">Notice</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const allowed = r.decisions.filter((d) => d.granted).map((d) => d.purpose);
                  return (
                    <tr key={String(r._id)}>
                      <td className="whitespace-nowrap text-xs text-mist">{formatDateTime(r.createdAt!)}</td>
                      <td className="font-mono text-xs">{r.principalId.slice(0, 10)}…</td>
                      <td>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={r.action === "withdraw" ? "warning" : r.action === "grant" ? "success" : "info"}>{actionLabel[r.action]}</Badge>
                          {r.parentalConsentId ? <Badge tone="info">Parent approved</Badge> : r.ageGroup === "child" ? <Badge>Under 18</Badge> : null}
                        </div>
                      </td>
                      <td className="text-xs">{allowed.length > 0 ? allowed.join(", ") : <span className="text-mist">{r.source === "form" ? "None" : "Essential only"}</span>}</td>
                      <td className="text-xs">
                        {r.source === "form" ? (
                          <>
                            <span className="block">Form: <span className="font-mono">{r.formId}</span></span>
                            <span className="block font-mono text-2xs text-mist" title="Receipt id, sent with the form as hp_consent_id">{r.receiptId}</span>
                          </>
                        ) : (
                          <span className="text-mist">Banner</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap text-xs text-mist">
                        v{r.noticeVersion}, {languageLabel(r.language ?? "en")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(page > 1 || hasNext) && (
            <nav aria-label="Pagination" className="flex justify-between px-6 py-4 text-xs">
              {page > 1 ? <Link href={`${base}?page=${page - 1}`} className="text-fog hover:text-paper">Newer</Link> : <span />}
              {hasNext && <Link href={`${base}?page=${page + 1}`} className="text-fog hover:text-paper">Older</Link>}
            </nav>
          )}
        </>
      )}
    </Panel>
  );
}
