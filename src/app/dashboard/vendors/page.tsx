import Link from "next/link";
import { CalendarClock, FileSignature, Handshake, TriangleAlert } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { ArchiveVendorButton, SyncVendorsButton } from "@/features/vendors/vendor-actions";
import { VendorForm } from "@/features/vendors/vendor-form";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate, relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dpaCovered, dpaStatusLabel, vendorCategoryLabel } from "@/lib/vendors/constants";
import { Site, Vendor } from "@/models";

export const metadata = { title: "Vendors" };

const RENEWAL_WINDOW_DAYS = 30;

const FILTERS = [
  { id: "all", label: "All" },
  { id: "missing", label: "Missing DPA" },
  { id: "signed", label: "Signed" },
  { id: "not_needed", label: "Not needed" },
  { id: "renewals", label: "Renewing soon" },
  { id: "archived", label: "Archived" },
] as const;

const STATUS_TONE: Record<string, BadgeTone> = { not_started: "warning", requested: "info", signed: "success", not_needed: "muted" };

const dateValue = (d?: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { org, role } = await requireAuth();
  const { filter: filterId } = await searchParams;
  const filter = FILTERS.find((f) => f.id === filterId) ?? FILTERS[0];
  const canEdit = can(role, "settings");

  const [vendors, sites] = await Promise.all([
    Vendor.find({ orgId: org._id }).sort({ name: 1 }).limit(500).lean(),
    Site.find({ orgId: org._id }).select("name").lean(),
  ]);
  const siteName = new Map(sites.map((s) => [String(s._id), s.name]));
  const now = new Date();
  const renewalCutoff = new Date(now.getTime() + RENEWAL_WINDOW_DAYS * 86_400_000);
  const renewingSoon = (v: (typeof vendors)[number]) => v.dpaStatus === "signed" && v.dpaRenewalAt != null && v.dpaRenewalAt <= renewalCutoff;

  const active = vendors.filter((v) => !v.archivedAt);
  const missing = active.filter((v) => !dpaCovered(v.dpaStatus));
  const renewals = active.filter(renewingSoon);
  const overdueRenewals = renewals.filter((v) => v.dpaRenewalAt! < now).length;

  const shown = {
    all: active,
    missing,
    signed: active.filter((v) => v.dpaStatus === "signed"),
    not_needed: active.filter((v) => v.dpaStatus === "not_needed"),
    renewals,
    archived: vendors.filter((v) => v.archivedAt),
  }[filter.id];

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Third parties that handle personal data for you, such as analytics, chat and payment providers. DPDP lets you use a processor only under a valid contract, so track each data processing agreement (DPA) here."
        actions={can(role, "content.edit") && vendors.length > 0 && <SyncVendorsButton />}
      />

      {vendors.length === 0 ? (
        <Panel>
          <EmptyState
            icon={Handshake}
            title="No vendors yet"
            description="Website scans add the trackers, chat widgets and consent tools they find. Pull in your existing scans, or add vendors like your payment gateway or email provider by hand."
            action={can(role, "content.edit") && <SyncVendorsButton />}
          />
        </Panel>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active vendors" value={String(active.length)} icon={Handshake} href="/dashboard/vendors?filter=all" />
            <StatCard
              label="DPA signed"
              value={String(active.length - missing.length)}
              note={active.length ? `${Math.round(((active.length - missing.length) / active.length) * 100)}% covered` : undefined}
              tone={missing.length === 0 && active.length > 0 ? "success" : "default"}
              icon={FileSignature}
              href="/dashboard/vendors?filter=signed"
            />
            <StatCard
              label="Missing DPA"
              value={String(missing.length)}
              note={missing.length ? "Request or sign these" : "None outstanding"}
              tone={missing.length ? "warning" : "success"}
              icon={TriangleAlert}
              href="/dashboard/vendors?filter=missing"
            />
            <StatCard
              label={`Renewals in ${RENEWAL_WINDOW_DAYS} days`}
              value={String(renewals.length)}
              note={overdueRenewals ? `${overdueRenewals} overdue` : undefined}
              tone={overdueRenewals ? "danger" : "default"}
              icon={CalendarClock}
              href="/dashboard/vendors?filter=renewals"
            />
          </div>

          <nav aria-label="Filter vendors" className="mb-6 flex max-w-full flex-wrap gap-1 rounded-[20px] border border-line bg-surface p-1 sm:inline-flex">
            {FILTERS.map((f) => (
              <Link
                key={f.id}
                href={`/dashboard/vendors?filter=${f.id}`}
                aria-current={f.id === filter.id ? "page" : undefined}
                className={cn(
                  "rounded-full px-4 py-1.5 text-xs font-medium transition-all duration-300 ease-apple",
                  f.id === filter.id ? "bg-paper text-ink" : "text-fog hover:text-paper",
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>

          <Panel>
            {shown.length === 0 ? (
              <PanelBody>
                <p className="text-sm text-mist">No vendors match this filter.</p>
              </PanelBody>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_9rem] gap-4 border-b border-line bg-white/[0.015] px-6 py-3 text-2xs font-medium uppercase tracking-wide text-mist md:grid">
                  <span>Vendor</span>
                  <span>Processed in</span>
                  <span>Agreement</span>
                  <span>DPA status</span>
                </div>
                <ul className="divide-y divide-white/[0.08]">
                  {shown.map((v) => {
                    const where = v.siteIds.map((id) => siteName.get(String(id))).filter(Boolean);
                    const soon = renewingSoon(v);
                    return (
                      <li key={String(v._id)}>
                        <details className="group">
                          <summary className="grid cursor-pointer list-none gap-x-4 gap-y-1.5 px-6 py-4 transition-colors hover:bg-white/[0.03] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_9rem] md:items-center [&::-webkit-details-marker]:hidden">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{v.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-mist">
                                {vendorCategoryLabel(v.category)} ·{" "}
                                {where.length ? `Found on ${where.join(", ")}` : v.source === "scan" ? "Not in the latest scans" : "Added manually"}
                              </span>
                            </span>
                            <span className="text-xs text-fog">
                              <span className="text-mist md:hidden">Processed in </span>
                              {v.processingCountry || <span className="text-mist">Not recorded</span>}
                            </span>
                            <span className="text-xs">
                              {v.dpaSignedAt ? <span className="text-fog">Signed {formatDate(v.dpaSignedAt)}</span> : <span className="text-mist">Not signed</span>}
                              {v.dpaRenewalAt && (
                                <span className={cn("block", soon ? (v.dpaRenewalAt < now ? "font-medium text-danger" : "text-warning") : "text-mist")}>
                                  Renews {soon ? relativeDays(v.dpaRenewalAt, now) : formatDate(v.dpaRenewalAt)}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center justify-between gap-3">
                              <Badge tone={STATUS_TONE[v.dpaStatus] ?? "muted"}>{dpaStatusLabel(v.dpaStatus)}</Badge>
                              <span className="text-xs text-mist group-open:hidden">{canEdit ? "Edit" : "View"}</span>
                              <span className="hidden text-xs text-mist group-open:inline">Close</span>
                            </span>
                          </summary>
                          <div className="border-t border-line bg-black/30 px-6 py-6">
                            {canEdit ? (
                              <VendorForm
                                vendor={{
                                  id: String(v._id),
                                  name: v.name,
                                  category: v.category,
                                  website: v.website ?? "",
                                  processingCountry: v.processingCountry ?? "",
                                  dataShared: v.dataShared ?? "",
                                  dpaStatus: v.dpaStatus,
                                  dpaSignedAt: dateValue(v.dpaSignedAt),
                                  dpaRenewalAt: dateValue(v.dpaRenewalAt),
                                  contactEmail: v.contactEmail ?? "",
                                  notes: v.notes ?? "",
                                }}
                              />
                            ) : (
                              <dl className="grid gap-x-6 gap-y-4 text-xs sm:grid-cols-2">
                                {[
                                  ["Personal data shared", v.dataShared],
                                  ["Website", v.website],
                                  ["Privacy or DPA contact", v.contactEmail],
                                  ["Notes", v.notes],
                                ].map(([label, value]) => (
                                  <div key={label}>
                                    <dt className="text-mist">{label}</dt>
                                    <dd className="mt-1 break-words text-fog">{value || "Not recorded"}</dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                              <p className="text-2xs text-mist">
                                {v.source === "scan" && v.firstDetectedAt
                                  ? `First detected ${formatDate(v.firstDetectedAt)}, last seen ${formatDate(v.lastDetectedAt ?? v.firstDetectedAt)}.`
                                  : `Added manually ${formatDate(v.createdAt)}.`}
                                {v.archivedAt && ` Archived ${formatDate(v.archivedAt)}.`}
                              </p>
                              {canEdit && <ArchiveVendorButton vendorId={String(v._id)} name={v.name} archived={Boolean(v.archivedAt)} />}
                            </div>
                          </div>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Panel>
        </>
      )}

      {canEdit && (
        <Panel id="add-vendor" className="mt-6">
          <PanelHeader title="Add a vendor" description="Processors a scan can't see: payment gateway, email or SMS provider, CRM, hosting, payroll." />
          <PanelBody>
            <VendorForm />
          </PanelBody>
        </Panel>
      )}
    </>
  );
}
