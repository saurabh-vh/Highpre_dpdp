import { Check, ExternalLink } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Meter } from "@/components/ui/meter";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { CancelPlanButton, PlanButton } from "@/features/billing/plan-button";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { PLANS, formatPrice, getPlan } from "@/lib/billing/plans";
import { type RazorpayInvoice, listInvoices } from "@/lib/billing/razorpay";
import { getUsage } from "@/lib/billing/usage";
import { billingConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Plan and billing" };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  authenticated: { label: "Starting", tone: "info" },
  pending: { label: "Payment retrying", tone: "warning" },
  halted: { label: "Payment failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
  completed: { label: "Ended", tone: "muted" },
  expired: { label: "Expired", tone: "muted" },
};

export default async function BillingPage() {
  const { org, role, plan } = await requireAuth();
  const usage = await getUsage(org);
  const isOwner = can(role, "billing");
  const configured = billingConfigured();
  const billing = org.billing ?? {};
  const status = STATUS[billing.status ?? ""];
  const live = ["active", "authenticated", "pending"].includes(billing.status ?? "");
  const subscribedPlan = getPlan(org.plan);

  let invoices: RazorpayInvoice[] = [];
  let invoiceError = false;
  if (configured && billing.subscriptionId && isOwner) {
    try {
      invoices = await listInvoices(billing.subscriptionId);
    } catch {
      invoiceError = true;
    }
  }

  return (
    <>
      <PageHeader title="Plan and billing" description="Your plan, what you're using and your invoices. Prices are per month and exclude 18% GST." />

      {!configured && (
        <Callout tone="info" title="Online payments aren't set up on this server" className="mb-6">
          Add your Razorpay keys and plan IDs to the environment to enable upgrades. See &quot;Billing&quot; in the README.
        </Callout>
      )}
      {billing.status === "halted" && (
        <Callout tone="danger" title="Your last payment failed" className="mb-6">
          You&apos;re on the Free plan until you subscribe again. Nothing has been deleted and consent is still being recorded.
        </Callout>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <PanelHeader title="Current plan" action={status && plan.id !== "free" && <Badge tone={status.tone}>{status.label}</Badge>} />
          <PanelBody className="space-y-4">
            <div>
              <p className="text-2xl font-semibold tracking-tight">{plan.name}</p>
              <p className="mt-1 text-sm text-mist">
                {plan.price === 0 ? "Free forever" : `${formatPrice(plan.price)} a month + GST`}
              </p>
            </div>
            {billing.currentPeriodEnd && plan.id !== "free" && (
              <p className="text-xs text-fog">
                {billing.cancelAtPeriodEnd || billing.status === "cancelled"
                  ? `Ends on ${formatDate(billing.currentPeriodEnd)}. You'll move to the Free plan after that.`
                  : `Renews on ${formatDate(billing.currentPeriodEnd)}.`}
              </p>
            )}
            {isOwner && live && !billing.cancelAtPeriodEnd && <CancelPlanButton />}
            {!isOwner && <p className="text-xs text-mist">Only the account owner can change the plan.</p>}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Usage" description="Consent is always recorded, even over the limit." />
          <PanelBody className="space-y-5">
            <Meter label="Websites" used={usage.sites} limit={plan.limits.sites} />
            <Meter label="Team members (incl. invitations)" used={usage.seats} limit={plan.limits.seats} />
            <Meter label="Consent records this month" used={usage.consentsThisMonth} limit={plan.limits.consentsPerMonth} />
          </PanelBody>
        </Panel>
      </div>

      <h2 className="mb-4 text-sm font-semibold">Plans</h2>
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const current = p.id === plan.id;
          return (
            <div key={p.id} className={cn("surface flex flex-col rounded-panel p-6", current && "border-white/40")}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{p.name}</p>
                {current && <Badge tone="solid">Current</Badge>}
              </div>
              <p className="mt-3">
                <span className="text-2xl font-semibold tracking-tight">{formatPrice(p.price)}</span>
                <span className="text-xs text-mist"> / month</span>
              </p>
              <p className="mt-1 text-xs text-mist">{p.tagline}</p>
              <ul className="mb-6 mt-5 flex-1 space-y-2.5">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-xs text-fog">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" strokeWidth={2.4} aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
              {isOwner && configured && !current && p.id !== "free" && (
                <PlanButton planId={p.id} label={subscribedPlan.id !== "free" && live ? `Switch to ${p.name}` : `Upgrade to ${p.name}`} variant={p.id === "starter" ? "primary" : "outline"} />
              )}
              {p.id === "free" && !current && <p className="text-center text-2xs text-mist">Cancel your subscription to move to Free.</p>}
            </div>
          );
        })}
      </div>

      {isOwner && billing.subscriptionId && (
        <Panel>
          <PanelHeader title="Invoices" description="GST invoices issued by Razorpay for your subscription." />
          {invoiceError ? (
            <PanelBody><p className="text-xs text-mist">Invoices couldn&apos;t be loaded right now.</p></PanelBody>
          ) : invoices.length === 0 ? (
            <PanelBody><p className="text-xs text-mist">No invoices yet.</p></PanelBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sr-only">Link</span></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="text-xs">{inv.issued_at ? formatDate(new Date(inv.issued_at * 1000)) : "—"}</td>
                      <td className="text-xs tabular-nums">{formatPrice(Math.round(inv.amount / 100))}</td>
                      <td><Badge tone={inv.status === "paid" ? "success" : inv.status === "issued" ? "warning" : "muted"}>{inv.status}</Badge></td>
                      <td className="text-right">
                        {inv.short_url && (
                          <a href={inv.short_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-fog hover:text-paper">
                            View <ExternalLink className="size-3" aria-hidden />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </>
  );
}
