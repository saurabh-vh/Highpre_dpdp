import { audit } from "@/lib/audit";
import { type RazorpaySubscription, verifyWebhookSignature } from "@/lib/billing/razorpay";
import { applySubscription } from "@/lib/billing/sync";
import { connectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/mailer";
import { paymentFailedEmail } from "@/lib/mail/templates";
import { BillingEvent, Organization, User } from "@/models";

export const dynamic = "force-dynamic";

/**
 * Razorpay webhook. Configure in Razorpay → Settings → Webhooks with URL
 * {APP_URL}/api/billing/webhook, the RAZORPAY_WEBHOOK_SECRET, and the
 * subscription.* events. Verified by signature, idempotent by event id.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? "")) {
    log.warn("billing.webhook_bad_signature");
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  let body: { event?: string; payload?: { subscription?: { entity?: RazorpaySubscription } } };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const event = body.event ?? "";
  const sub = body.payload?.subscription?.entity;
  if (!event.startsWith("subscription.") || !sub?.id) return Response.json({ ok: true, ignored: true });

  await connectDb();
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${event}:${sub.id}:${sub.status}:${sub.current_end ?? ""}`;
  try {
    await BillingEvent.create({ eventId, event, subscriptionId: sub.id });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return Response.json({ ok: true, duplicate: true });
    throw error;
  }

  const result = await applySubscription(sub);
  if (!result) {
    log.warn("billing.webhook_unknown_subscription", { subscriptionId: sub.id, event });
    return Response.json({ ok: true, unknown: true });
  }
  await BillingEvent.updateOne({ eventId }, { orgId: result.orgId });

  if (result.previousStatus !== sub.status) {
    await audit(result.orgId, null, "billing.status", `Subscription is now ${sub.status}`);
  }
  if (sub.status === "halted" && result.previousStatus !== "halted") await notifyOwners(result.orgId);

  log.info("billing.webhook", { event, subscriptionId: sub.id, status: sub.status });
  return Response.json({ ok: true });
}

async function notifyOwners(orgId: string) {
  const org = await Organization.findById(orgId).lean();
  if (!org) return;
  const ownerIds = org.members.filter((m) => m.role === "owner").map((m) => m.userId);
  const owners = await User.find({ _id: { $in: ownerIds } }).select("email").lean();
  const url = `${env().APP_URL}/dashboard/billing`;
  await Promise.all(owners.map((o) => sendMail(paymentFailedEmail({ to: o.email, orgName: org.name, url })).catch(() => {})));
}
