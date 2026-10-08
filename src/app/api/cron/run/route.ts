import { timingSafeEqual } from "crypto";
import type { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/mailer";
import { breachReminderEmail, dpaRenewalReminderEmail, requestReminderEmail } from "@/lib/mail/templates";
import { AgentDevice, BillingEvent, Breach, Organization, RightsRequest, Scan, User, Vendor } from "@/models";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REMIND_DAYS_BEFORE = 3;
const DPA_REMIND_DAYS_BEFORE = 14;

function authorized(req: Request): boolean {
  const secret = env().CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Owners, admins and the grievance contact: the people who act on deadlines. */
async function recipients(orgId: Types.ObjectId | string) {
  const org = await Organization.findById(orgId).lean();
  if (!org) return null;
  const ids = org.members.filter((m) => m.role !== "member").map((m) => m.userId);
  const users = await User.find({ _id: { $in: ids } }).select("email").lean();
  return { org, emails: [...new Set([...users.map((u) => u.email), ...(org.grievanceEmail ? [org.grievanceEmail] : [])])] };
}

/**
 * Scheduled jobs, safe to run as often as hourly (each reminder is sent once):
 * - data requests due within 3 days, and again once overdue
 * - breach reports due within 24 hours
 * - vendor DPA renewals due within 14 days
 * - cleanup of anonymous scans and old billing events
 * Call with `Authorization: Bearer $CRON_SECRET`.
 */
export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await connectDb();
  const now = new Date();
  const base = env().APP_URL;
  const stats = { requestReminders: 0, breachReminders: 0, dpaReminders: 0, scansRemoved: 0, eventsRemoved: 0, unusedAgentDownloads: 0 };

  // ── Data request deadlines ──
  const soon = new Date(now.getTime() + REMIND_DAYS_BEFORE * 86_400_000);
  const due = await RightsRequest.find({
    status: { $in: ["open", "in_progress"] },
    $or: [
      { dueAt: { $lt: now }, reminderSent: { $ne: "overdue" } },
      { dueAt: { $gte: now, $lte: soon }, reminderSent: { $exists: false } },
    ],
  })
    .select("orgId reference type dueAt")
    .lean();

  const byOrg = new Map<string, typeof due>();
  for (const r of due) byOrg.set(String(r.orgId), [...(byOrg.get(String(r.orgId)) ?? []), r]);
  for (const [orgId, items] of byOrg) {
    const who = await recipients(orgId);
    if (!who || who.emails.length === 0) continue;
    const mail = { orgName: who.org.name, url: `${base}/dashboard/requests`, items: items.map((i) => ({ reference: i.reference, type: i.type, dueAt: i.dueAt, overdue: i.dueAt < now })) };
    const results = await Promise.allSettled(who.emails.map((to) => sendMail(requestReminderEmail({ to, ...mail }))));
    if (results.some((r) => r.status === "fulfilled")) {
      await Promise.all(items.map((i) => RightsRequest.updateOne({ _id: i._id }, { reminderSent: i.dueAt < now ? "overdue" : "soon" })));
      stats.requestReminders += items.length;
    }
  }

  // ── Breach report deadlines ──
  const breaches = await Breach.find({
    closedAt: { $exists: false },
    reminderSentAt: { $exists: false },
    reportDueAt: { $lte: new Date(now.getTime() + 24 * 3_600_000) },
    steps: { $elemMatch: { key: "detailed_report", doneAt: { $exists: false } } },
  }).lean();
  for (const b of breaches) {
    const who = await recipients(b.orgId);
    if (!who) continue;
    const results = await Promise.allSettled(
      who.emails.map((to) =>
        sendMail(breachReminderEmail({ to, orgName: who.org.name, reference: b.reference, title: b.title, reportDueAt: b.reportDueAt, url: `${base}/dashboard/breaches/${b._id}` })),
      ),
    );
    if (results.some((r) => r.status === "fulfilled")) {
      await Breach.updateOne({ _id: b._id }, { reminderSentAt: now });
      stats.breachReminders++;
    }
  }

  // ── Vendor DPA renewals ──
  // Remembers which renewal date was reminded, so moving the date re-arms the reminder.
  const renewals = await Vendor.find({
    archivedAt: null,
    dpaStatus: "signed",
    dpaRenewalAt: { $gte: now, $lte: new Date(now.getTime() + DPA_REMIND_DAYS_BEFORE * 86_400_000) },
    $expr: { $ne: ["$renewalReminderFor", "$dpaRenewalAt"] },
  })
    .select("orgId name dpaRenewalAt")
    .lean();
  const renewalsByOrg = new Map<string, typeof renewals>();
  for (const v of renewals) renewalsByOrg.set(String(v.orgId), [...(renewalsByOrg.get(String(v.orgId)) ?? []), v]);
  for (const [orgId, items] of renewalsByOrg) {
    const who = await recipients(orgId);
    if (!who || who.emails.length === 0) continue;
    const mail = { orgName: who.org.name, url: `${base}/dashboard/vendors?filter=renewals`, items: items.map((i) => ({ name: i.name, renewalAt: i.dpaRenewalAt! })) };
    const results = await Promise.allSettled(who.emails.map((to) => sendMail(dpaRenewalReminderEmail({ to, ...mail }))));
    if (results.some((r) => r.status === "fulfilled")) {
      await Promise.all(items.map((i) => Vendor.updateOne({ _id: i._id }, { renewalReminderFor: i.dpaRenewalAt })));
      stats.dpaReminders += items.length;
    }
  }

  // ── Cleanup ──
  stats.scansRemoved = (await Scan.deleteMany({ siteId: null, createdAt: { $lt: new Date(now.getTime() - 90 * 86_400_000) } })).deletedCount;
  stats.eventsRemoved = (await BillingEvent.deleteMany({ createdAt: { $lt: new Date(now.getTime() - 400 * 86_400_000) } })).deletedCount;

  // Agent downloads that never checked in within 30 days: drop their tokens.
  stats.unusedAgentDownloads = (await AgentDevice.deleteMany({ lastSeenAt: { $exists: false }, createdAt: { $lt: new Date(now.getTime() - 30 * 86_400_000) } })).deletedCount;

  log.info("cron.run", stats);
  return Response.json({ ok: true, ...stats });
}
