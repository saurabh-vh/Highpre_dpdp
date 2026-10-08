"use server";

import { revalidatePath } from "next/cache";
import { fail, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { getPlan, type PlanId } from "@/lib/billing/plans";
import {
  RazorpayError,
  cancelSubscription,
  changeSubscriptionPlan,
  createSubscription,
  fetchSubscription,
  razorpayPlanId,
  verifyCheckoutSignature,
} from "@/lib/billing/razorpay";
import { applySubscription } from "@/lib/billing/sync";
import { billingConfigured, env } from "@/lib/env";
import { log } from "@/lib/log";
import { Organization } from "@/models";

export type CheckoutState = ActionState & {
  checkout?: { key: string; subscriptionId: string; planName: string; name: string; email: string; orgName: string };
};

const LIVE = ["authenticated", "active", "pending"];

/**
 * Starts an upgrade. With no live subscription, creates one and returns what
 * Razorpay Checkout needs. With a live one, switches its plan in place.
 */
export async function startCheckoutAction(planId: PlanId): Promise<CheckoutState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "billing")) return fail(denied("billing"));
  if (!billingConfigured()) return fail("Billing isn't set up on this server yet.");
  const plan = getPlan(planId);
  const rzpPlan = razorpayPlanId(plan.id);
  if (!rzpPlan) return fail("That plan isn't available.");

  const billing = org.billing ?? {};
  try {
    if (billing.subscriptionId && LIVE.includes(billing.status ?? "")) {
      if (org.plan === plan.id) return fail(`You're already on the ${plan.name} plan.`);
      const sub = await changeSubscriptionPlan(billing.subscriptionId, rzpPlan);
      await applySubscription(sub);
      await audit(org._id, user, "billing.plan_changed", `Changed plan to ${plan.name}`);
      revalidatePath("/dashboard", "layout");
      return succeed(`You're now on the ${plan.name} plan. The difference is prorated on your next invoice.`);
    }

    const sub = await createSubscription({ planId: rzpPlan, orgId: org.id, email: user.email });
    await Organization.updateOne({ _id: org._id }, { $set: { "billing.pendingSubscriptionId": sub.id, "billing.pendingPlan": plan.id } });
    return {
      ok: true,
      checkout: { key: env().RAZORPAY_KEY_ID, subscriptionId: sub.id, planName: plan.name, name: user.name, email: user.email, orgName: org.name },
    };
  } catch (error) {
    log.error("billing.checkout_failed", { orgId: org.id, error: String(error) });
    if (error instanceof RazorpayError && billing.subscriptionId) {
      return fail("Razorpay couldn't switch plans for this payment method (UPI mandates can't be changed). Cancel your current plan, then subscribe again when it ends.");
    }
    return fail("We couldn't reach the payment provider. Try again in a minute.");
  }
}

/** Confirms a completed Razorpay Checkout using its signature, then activates the plan. */
export async function verifyCheckoutAction(input: { paymentId: string; subscriptionId: string; signature: string }): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "billing")) return fail(denied("billing"));
  if (input.subscriptionId !== org.billing?.pendingSubscriptionId) return fail("This payment doesn't match your checkout. Contact support if you were charged.");
  if (!verifyCheckoutSignature(input.paymentId, input.subscriptionId, input.signature)) {
    log.warn("billing.bad_signature", { orgId: org.id });
    return fail("We couldn't verify this payment. Contact support if you were charged.");
  }

  try {
    const sub = await fetchSubscription(input.subscriptionId);
    await applySubscription(sub);
  } catch (error) {
    // The webhook will catch up; the payment itself is already verified.
    log.error("billing.sync_failed", { orgId: org.id, error: String(error) });
  }
  const plan = getPlan(org.billing?.pendingPlan);
  await audit(org._id, user, "billing.subscribed", `Subscribed to the ${plan.name} plan`);
  revalidatePath("/dashboard", "layout");
  return succeed(`Payment received. Welcome to ${plan.name}!`);
}

/** Cancels at the end of the paid period, so the business keeps what it paid for. */
export async function cancelPlanAction(): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "billing")) return fail(denied("billing"));
  const id = org.billing?.subscriptionId;
  if (!id || !LIVE.includes(org.billing?.status ?? "")) return fail("There's no active subscription to cancel.");

  try {
    await cancelSubscription(id, true);
  } catch (error) {
    log.error("billing.cancel_failed", { orgId: org.id, error: String(error) });
    return fail("We couldn't reach the payment provider. Try again in a minute.");
  }
  await Organization.updateOne({ _id: org._id }, { $set: { "billing.cancelAtPeriodEnd": true } });
  await audit(org._id, user, "billing.cancelled", "Cancelled the subscription at the end of the billing period");
  revalidatePath("/dashboard/billing");
  return succeed("Cancelled. You keep your plan until the end of the current billing period.");
}
