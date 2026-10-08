import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import type { PlanId } from "./plans";

/**
 * Minimal Razorpay Subscriptions client over the REST API (no SDK needed).
 * Docs: https://razorpay.com/docs/api/payments/subscriptions/
 */

const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export type RazorpaySubscription = {
  id: string;
  plan_id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  short_url?: string;
  notes?: Record<string, string>;
};

export type RazorpayInvoice = {
  id: string;
  status: string;
  amount: number;
  amount_paid: number;
  currency: string;
  short_url?: string;
  issued_at?: number | null;
  paid_at?: number | null;
  billing_start?: number | null;
  billing_end?: number | null;
};

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET } = env();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const description = (data as { error?: { description?: string } }).error?.description ?? "Razorpay request failed";
    throw new RazorpayError(description, res.status);
  }
  return data as T;
}

/** Razorpay plan ID for one of our paid plans. */
export function razorpayPlanId(plan: PlanId): string | null {
  const e = env();
  if (plan === "starter") return e.RAZORPAY_PLAN_STARTER || null;
  if (plan === "growth") return e.RAZORPAY_PLAN_GROWTH || null;
  return null;
}

/** Maps a Razorpay plan ID back to our plan. */
export function planFromRazorpay(razorpayPlan: string | undefined): PlanId | null {
  const e = env();
  if (razorpayPlan && razorpayPlan === e.RAZORPAY_PLAN_STARTER) return "starter";
  if (razorpayPlan && razorpayPlan === e.RAZORPAY_PLAN_GROWTH) return "growth";
  return null;
}

export function createSubscription(opts: { planId: string; orgId: string; email: string }) {
  return call<RazorpaySubscription>("POST", "/subscriptions", {
    plan_id: opts.planId,
    // Monthly billing for up to 10 years; customers cancel from the dashboard.
    total_count: 120,
    customer_notify: 1,
    notes: { orgId: opts.orgId, email: opts.email },
  });
}

export const fetchSubscription = (id: string) => call<RazorpaySubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);

/** Switches plan immediately with proration. Razorpay allows this for card mandates only. */
export const changeSubscriptionPlan = (id: string, planId: string) =>
  call<RazorpaySubscription>("PATCH", `/subscriptions/${encodeURIComponent(id)}`, { plan_id: planId, schedule_change_at: "now", customer_notify: 1 });

export const cancelSubscription = (id: string, atCycleEnd: boolean) =>
  call<RazorpaySubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });

export async function listInvoices(subscriptionId: string): Promise<RazorpayInvoice[]> {
  const data = await call<{ items: RazorpayInvoice[] }>("GET", `/invoices?subscription_id=${encodeURIComponent(subscriptionId)}&count=24`);
  return data.items ?? [];
}

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Checks the signature Razorpay Checkout returns after a subscription payment. */
export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string, secret = env().RAZORPAY_KEY_SECRET): boolean {
  const expected = createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** Checks the X-Razorpay-Signature header against the raw webhook body. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret = env().RAZORPAY_WEBHOOK_SECRET): boolean {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export const fromUnix = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000) : undefined);
