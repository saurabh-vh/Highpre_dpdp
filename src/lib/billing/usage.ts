import "server-only";
import type { Types } from "mongoose";
import { ConsentRecord, Invite, Site } from "@/models";
import type { Plan } from "./plans";

/** Start of the current calendar month in India (IST, UTC+5:30). */
export function monthStartIst(now = new Date()): Date {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - 330 * 60_000);
}

export type Usage = { sites: number; seats: number; consentsThisMonth: number };

export async function getUsage(org: { _id: Types.ObjectId; members: unknown[] }): Promise<Usage> {
  const siteIds = (await Site.find({ orgId: org._id }).select("_id").lean()).map((s) => s._id);
  const [pendingInvites, consentsThisMonth] = await Promise.all([
    Invite.countDocuments({ orgId: org._id, expiresAt: { $gt: new Date() } }),
    siteIds.length ? ConsentRecord.countDocuments({ siteId: { $in: siteIds }, createdAt: { $gte: monthStartIst() } }) : 0,
  ]);
  return { sites: siteIds.length, seats: org.members.length + pendingInvites, consentsThisMonth };
}

/** Plain-language reason an action is blocked by the plan, or null when it's allowed. */
export function siteLimitReached(plan: Plan, sites: number): string | null {
  return sites >= plan.limits.sites
    ? `Your ${plan.name} plan includes ${plan.limits.sites} website${plan.limits.sites > 1 ? "s" : ""}. Upgrade to add more.`
    : null;
}

export function seatLimitReached(plan: Plan, seats: number): string | null {
  return seats >= plan.limits.seats
    ? `Your ${plan.name} plan includes ${plan.limits.seats} team member${plan.limits.seats > 1 ? "s" : ""}, including pending invitations. Upgrade to invite more.`
    : null;
}
