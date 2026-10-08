/**
 * Subscription plans. Prices are shown in the app and must match the plans
 * created in the Razorpay dashboard (Subscriptions → Plans), whose IDs go in
 * RAZORPAY_PLAN_STARTER / RAZORPAY_PLAN_GROWTH. Prices exclude 18% GST.
 * Client-safe: no secrets here.
 */

export type PlanId = "free" | "starter" | "growth";

export type Plan = {
  id: PlanId;
  name: string;
  /** Monthly price in rupees, before GST. */
  price: number;
  tagline: string;
  limits: {
    sites: number;
    seats: number;
    /** Soft limit: consent is always recorded; going over prompts an upgrade. */
    consentsPerMonth: number;
    /** Languages per site, including English. */
    languages: number;
  };
  features: { evidencePack: boolean; prioritySupport: boolean };
  highlights: string[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "For one small website getting started.",
    limits: { sites: 1, seats: 3, consentsPerMonth: 5_000, languages: 2 },
    features: { evidencePack: false, prioritySupport: false },
    highlights: ["1 website", "3 team members", "English and Hindi", "5,000 consent records a month", "Rights requests and breach checklist"],
  },
  {
    id: "starter",
    name: "Starter",
    price: 999,
    tagline: "For a growing business with a few websites.",
    limits: { sites: 3, seats: 5, consentsPerMonth: 50_000, languages: 8 },
    features: { evidencePack: true, prioritySupport: false },
    highlights: ["3 websites", "5 team members", "All 8 languages", "50,000 consent records a month", "PDF evidence pack"],
  },
  {
    id: "growth",
    name: "Growth",
    price: 2_999,
    tagline: "For agencies and multi-brand businesses.",
    limits: { sites: 15, seats: 10, consentsPerMonth: 500_000, languages: 8 },
    features: { evidencePack: true, prioritySupport: true },
    highlights: ["15 websites", "10 team members", "All 8 languages", "5,00,000 consent records a month", "PDF evidence pack", "Priority support"],
  },
];

export const PLAN_IDS = PLANS.map((p) => p.id) as [PlanId, ...PlanId[]];
export const getPlan = (id: string | null | undefined): Plan => PLANS.find((p) => p.id === id) ?? PLANS[0];

/** Razorpay subscription statuses that keep paid features on. */
const LIVE_STATUSES = new Set(["authenticated", "active", "pending"]);

type BillingLike = { status?: string | null; currentPeriodEnd?: Date | null } | null | undefined;

/**
 * The plan an organisation is entitled to right now. A cancelled subscription
 * keeps its plan until the paid period ends; failed payments ("halted") drop
 * back to Free. Data over the Free limits is kept, not deleted.
 */
export function effectivePlan(org: { plan?: string | null; billing?: BillingLike }, now = new Date()): Plan {
  const plan = getPlan(org.plan);
  if (plan.id === "free") return plan;
  const status = org.billing?.status ?? "";
  if (LIVE_STATUSES.has(status)) return plan;
  if (status === "cancelled" && org.billing?.currentPeriodEnd && org.billing.currentPeriodEnd > now) return plan;
  // Granted manually (e.g. by an admin) without a subscription.
  if (status === "" || status === "none") return plan;
  return PLANS[0];
}

export const formatPrice = (rupees: number) => (rupees === 0 ? "₹0" : `₹${new Intl.NumberFormat("en-IN").format(rupees)}`);
