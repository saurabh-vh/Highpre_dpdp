import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import { AgentDevice, AiUsage } from "@/models";
import { AGENT_APPS, AGENT_APP_KEYS, type AgentApp } from "./catalog";
import { getAgentPolicy } from "./policy";

/** AI assistants in the catalog: the only apps a usage report may name. */
export const AI_APP_KEYS = AGENT_APP_KEYS.filter((k) => AGENT_APPS[k].category === "ai") as [AgentApp, ...AgentApp[]];

/** Days of history a device may send at once, and how far back the server accepts a day. */
export const USAGE_MAX_DAYS = 14;
const ACCEPT_DAYS_BACK = 31;

/** Computers that haven't checked in for this long are flagged to owners. */
export const STALE_MS = 7 * 86_400_000;

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Which AI tools were opened on which days. Strict: no other field (no URLs,
 * times, titles or chats) can be sent, and only AI catalog keys are accepted.
 */
export const usageSchema = z
  .object({
    days: z
      .array(z.object({ day: dayString, apps: z.array(z.enum(AI_APP_KEYS)).max(AI_APP_KEYS.length) }).strict())
      .max(USAGE_MAX_DAYS),
  })
  .strict();

/** UTC date string for a time, YYYY-MM-DD. */
export const utcDay = (t: number | Date) => new Date(t).toISOString().slice(0, 10);

type UsageDevice = { _id: Types.ObjectId; orgId: Types.ObjectId; userId?: Types.ObjectId | null };

/**
 * Stores a device's daily AI-tool record, one row per (device, day, app).
 * Ignored entirely when the organisation has turned sharing off. Days that
 * aren't real dates, are in the future or are more than a month old are dropped.
 */
export async function ingestUsage(device: UsageDevice, days: z.infer<typeof usageSchema>["days"], now = Date.now()): Promise<{ stored: number; ignored: boolean }> {
  const policy = await getAgentPolicy(device.orgId);
  if (!policy.shareAiUsage) return { stored: 0, ignored: true };
  // Local dates can be a day ahead of UTC (India is UTC+5:30), so allow tomorrow.
  const latest = utcDay(now + 86_400_000);
  const earliest = utcDay(now - ACCEPT_DAYS_BACK * 86_400_000);
  const rows = new Map<string, { day: string; app: AgentApp }>();
  for (const { day, apps } of days) {
    if (Number.isNaN(Date.parse(`${day}T00:00:00Z`)) || utcDay(Date.parse(`${day}T00:00:00Z`)) !== day) continue;
    if (day > latest || day < earliest) continue;
    for (const app of apps) rows.set(`${day}|${app}`, { day, app });
  }
  if (!rows.size) return { stored: 0, ignored: false };
  const result = await AiUsage.bulkWrite(
    [...rows.values()].map(({ day, app }) => ({
      updateOne: {
        filter: { deviceId: device._id, day, app },
        update: { $setOnInsert: { orgId: device.orgId, deviceId: device._id, day, app, ...(device.userId ? { userId: device.userId } : {}) } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return { stored: result.upsertedCount, ignored: false };
}

export type AiToolTotal = { app: AgentApp; people: number };

/**
 * How many people used each AI tool in the last `days` days: distinct
 * devices, with one member's laptop and browser counted once. Company totals
 * only; nothing here says who.
 */
export async function aiToolTotals(orgId: Types.ObjectId | string, days = 30, now = Date.now()): Promise<{ tools: AiToolTotal[]; people: number }> {
  const match = { orgId: new Types.ObjectId(String(orgId)), day: { $gte: utcDay(now - days * 86_400_000) } };
  const person = { $ifNull: ["$userId", "$deviceId"] };
  const [tools, everyone] = await Promise.all([
    AiUsage.aggregate<{ _id: AgentApp; people: number }>([
      { $match: match },
      { $group: { _id: { app: "$app", who: person } } },
      { $group: { _id: "$_id.app", people: { $sum: 1 } } },
      { $sort: { people: -1, _id: 1 } },
    ]),
    AiUsage.aggregate<{ n: number }>([{ $match: match }, { $group: { _id: person } }, { $count: "n" }]),
  ]);
  return { tools: tools.map((t) => ({ app: t._id, people: t.people })), people: everyone[0]?.n ?? 0 };
}

/** A device that should be checking in but hasn't for a week (not removed, and it did connect once). */
export const isStale = (d: { lastSeenAt?: Date | null; uninstalledAt?: Date | null; revokedAt?: Date | null }, now = Date.now()) =>
  Boolean(d.lastSeenAt && !d.uninstalledAt && !d.revokedAt && now - d.lastSeenAt.getTime() >= STALE_MS);

/** Records that the person removed HighPre. Never revokes: an owner decides that. */
export async function markUninstalled(deviceId: Types.ObjectId, at = new Date()) {
  await AgentDevice.updateOne({ _id: deviceId, revokedAt: { $exists: false }, uninstalledAt: { $exists: false } }, { $set: { uninstalledAt: at } });
}

/**
 * The most-used AI tool the company hasn't approved, when enough of the team
 * uses it to be worth a company plan: at least 3 people and a quarter of
 * everyone seen using AI tools.
 */
export function popularUnapproved(tools: AiToolTotal[], people: number, allowed: readonly string[]): AiToolTotal | null {
  return tools.find((t) => !allowed.includes(t.app) && t.people >= 3 && t.people * 4 >= people) ?? null;
}
