import "server-only";
import { Types } from "mongoose";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/mailer";
import { agentDigestEmail } from "@/lib/mail/templates";
import { AgentAlert, AgentDevice, AgentPolicy, Organization, User } from "@/models";
import { getAgentPolicy } from "./policy";
import { STALE_MS, aiToolTotals, type AiToolTotal } from "./usage";

const WEEK_MS = 7 * 86_400_000;
// Hourly cron runs drift; an hour of slack keeps the digest on the same weekday.
const DIGEST_EVERY_MS = WEEK_MS - 3_600_000;
/** Outcomes where the data didn't go out. "masked" is counted if the catalog has it. */
const PREVENTED = new Set(["stopped", "blocked", "masked"]);

export type AgentDigest = {
  prevented: number;
  byDataType: { key: string; count: number }[];
  byOutcome: { key: string; count: number }[];
  notCheckingIn: number;
  removed: number;
  aiTools: AiToolTotal[];
};

const sorted = (m: Map<string, number>) => [...m].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

/** The past week for one organisation, in company totals. Null when there's nothing worth an email. */
export async function buildAgentDigest(orgId: Types.ObjectId | string, now = Date.now()): Promise<AgentDigest | null> {
  const since = new Date(now - WEEK_MS);
  const [alerts, notCheckingIn, removed, policy] = await Promise.all([
    AgentAlert.find({ orgId, occurredAt: { $gte: since } }).select("dataType outcome count").lean(),
    AgentDevice.countDocuments({ orgId, revokedAt: { $exists: false }, uninstalledAt: { $exists: false }, lastSeenAt: { $lt: new Date(now - STALE_MS) } }),
    AgentDevice.countDocuments({ orgId, revokedAt: { $exists: false }, uninstalledAt: { $gte: since } }),
    getAgentPolicy(orgId),
  ]);
  const types = new Map<string, number>();
  const outcomes = new Map<string, number>();
  let prevented = 0;
  for (const a of alerts) {
    const outcome = a.outcome ?? "warned";
    const n = a.count ?? 1;
    outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + n);
    if (outcome === "not_sensitive") continue; // false alarms aren't leaks
    types.set(a.dataType, (types.get(a.dataType) ?? 0) + n);
    if (PREVENTED.has(outcome)) prevented += n;
  }
  const aiTools = policy.shareAiUsage ? (await aiToolTotals(orgId, 7, now)).tools.slice(0, 5) : [];
  if (!alerts.length && !notCheckingIn && !removed && !aiTools.length) return null;
  return { prevented, byDataType: sorted(types), byOutcome: sorted(outcomes), notCheckingIn, removed, aiTools };
}

/**
 * Weekly email to each organisation's owners about the desktop agent and
 * browser extension: leaks prevented, computers not checking in or removed,
 * and the AI tools the team uses. At most once a week per organisation, and
 * only when there's something to say. Safe to call from an hourly cron.
 */
export async function runAgentDigests(now = new Date()): Promise<{ agentDigests: number }> {
  const orgIds: Types.ObjectId[] = await AgentDevice.distinct("orgId", { revokedAt: { $exists: false }, lastSeenAt: { $exists: true } });
  const due = new Date(now.getTime() - DIGEST_EVERY_MS);
  const url = `${env().APP_URL}/dashboard/agent/alerts`;
  let sent = 0;
  for (const orgId of orgIds) {
    // Claim this week's digest first, so overlapping cron runs can't both send it.
    try {
      await AgentPolicy.updateOne(
        { orgId, $or: [{ lastDigestAt: { $exists: false } }, { lastDigestAt: { $lt: due } }] },
        { $set: { lastDigestAt: now } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) continue; // already sent this week
      throw error;
    }
    try {
      const digest = await buildAgentDigest(orgId, now.getTime());
      if (!digest) continue;
      const org = await Organization.findById(orgId).lean();
      if (!org) continue;
      const owners = await User.find({ _id: { $in: org.members.filter((m) => m.role === "owner").map((m) => m.userId) } }).select("email").lean();
      const results = await Promise.allSettled(owners.map((o) => sendMail(agentDigestEmail({ to: o.email, orgName: org.name, url, ...digest }))));
      if (results.some((r) => r.status === "fulfilled")) sent++;
    } catch (error) {
      log.error("agent.digest_failed", { orgId: String(orgId), error: String(error) });
    }
  }
  return { agentDigests: sent };
}
