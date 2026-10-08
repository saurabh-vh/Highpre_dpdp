import "server-only";
import { Organization } from "@/models";
import { fromUnix, planFromRazorpay, type RazorpaySubscription } from "./razorpay";

const LIVE = new Set(["authenticated", "active", "pending"]);
const ENDED = new Set(["completed", "expired"]);

/**
 * Applies a Razorpay subscription's state to the organisation that owns it.
 * Shared by checkout verification and webhooks, and safe to call repeatedly.
 * A pending checkout only replaces the current subscription once it's live,
 * so an abandoned checkout never disturbs an active plan.
 * Returns the previous status, or null if no organisation owns it.
 */
export async function applySubscription(sub: RazorpaySubscription): Promise<{ orgId: string; previousStatus: string; activatedCheckout: boolean } | null> {
  const org = await Organization.findOne({
    $or: [{ "billing.subscriptionId": sub.id }, { "billing.pendingSubscriptionId": sub.id }],
  }).lean();
  if (!org) return null;

  const isPending = org.billing?.pendingSubscriptionId === sub.id;
  const previousStatus = isPending ? "none" : (org.billing?.status ?? "none");
  const plan = planFromRazorpay(sub.plan_id);

  // A pending checkout that never completed: leave the current subscription alone.
  if (isPending && !LIVE.has(sub.status)) return { orgId: String(org._id), previousStatus, activatedCheckout: false };

  const set: Record<string, unknown> = {
    "billing.status": sub.status,
    "billing.subscriptionId": sub.id,
    "billing.razorpayPlanId": sub.plan_id,
    "billing.currentPeriodEnd": fromUnix(sub.current_end),
    "billing.updatedAt": new Date(),
  };
  const unset: Record<string, ""> = {};
  if (isPending) {
    unset["billing.pendingSubscriptionId"] = "";
    unset["billing.pendingPlan"] = "";
    set["billing.cancelAtPeriodEnd"] = false;
  }
  if (plan && LIVE.has(sub.status)) set.plan = plan;
  if (ENDED.has(sub.status)) {
    set.plan = "free";
    set["billing.cancelAtPeriodEnd"] = false;
  }

  await Organization.updateOne({ _id: org._id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  return { orgId: String(org._id), previousStatus, activatedCheckout: isPending };
}
