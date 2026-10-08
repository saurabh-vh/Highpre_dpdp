import { Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PLANS, formatPrice } from "@/lib/billing/plans";
import { cn } from "@/lib/utils";

/** Plan comparison on the landing page, from the same data the billing page uses. */
export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-28 sm:py-36">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold text-balance sm:text-3xl">Simple pricing.</h2>
        <p className="mt-4 text-sm text-mist sm:text-base">Start free. Upgrade when you add websites or teammates. Prices per month, plus 18% GST. Cancel anytime.</p>
      </div>
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {PLANS.map((plan) => {
          const featured = plan.id === "starter";
          return (
            <div key={plan.id} className={cn("glass flex flex-col rounded-sheet p-7", featured && "glass-strong border-white/30")}>
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{plan.name}</h3>
                {featured && <span className="rounded-full bg-paper px-2.5 py-0.5 text-2xs font-medium text-ink">Most popular</span>}
              </div>
              <p className="mt-4">
                <span className="text-3xl font-semibold tracking-tight">{formatPrice(plan.price)}</span>
                <span className="text-sm text-mist"> / month</span>
              </p>
              <p className="mt-2 text-sm text-mist">{plan.tagline}</p>
              <ul className="mb-8 mt-6 flex-1 space-y-3">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex gap-2.5 text-sm text-fog">
                    <Check className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/register" variant={featured ? "primary" : "secondary"} className="w-full">
                {plan.price === 0 ? "Start free" : `Start with ${plan.name}`}
              </ButtonLink>
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-xs text-mist">Payments by Razorpay: UPI, cards and net banking. GST invoice every month.</p>
    </section>
  );
}
