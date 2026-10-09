import "server-only";
import { z } from "zod";
import { sha256 } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/mailer";
import { agentAlertEmail } from "@/lib/mail/templates";
import { AgentAlert, AgentDevice, Organization, User } from "@/models";
import {
  AGENT_APP_KEYS,
  AGENT_DATA_TYPES,
  AGENT_DATA_TYPE_KEYS,
  ALERT_OUTCOME_KEYS,
  ALERT_SOURCES,
  ALERT_VIA_KEYS,
  type AgentDataType,
} from "./catalog";
import { getAgentPolicy } from "./policy";

const DEDUPE_MS = 10 * 60_000;
const EMAIL_EVERY_MS = 15 * 60_000;

/** Device names are shown to owners; strip control characters and cap the length. */
const deviceText = (max: number) => z.string().max(200).transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max));

export const heartbeatSchema = z
  .object({ hostname: deviceText(64), osVersion: deviceText(64), agentVersion: deviceText(20) })
  .strict();

/** A company installer registering a computer. */
export const enrollSchema = z
  .object({
    enrollKey: z.string().max(100),
    hostname: deviceText(64),
    osUser: deviceText(64),
    osVersion: deviceText(64),
    agentVersion: deviceText(20),
    platform: z.enum(["windows", "mac-arm64", "mac-intel"]),
  })
  .strict();

/**
 * `.strict()` rejects unknown fields, so nothing but these keys can be stored.
 * `source` and `outcome` are optional for the desktop agent, which only warns.
 * `via` says how the data was on its way out (pasted, typed, a file...), never what it was.
 */
export const alertsSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            dataType: z.enum(AGENT_DATA_TYPE_KEYS),
            app: z.enum(AGENT_APP_KEYS),
            occurredAt: z.coerce.date(),
            source: z.enum(ALERT_SOURCES).optional(),
            outcome: z.enum(ALERT_OUTCOME_KEYS).optional(),
            via: z.enum(ALERT_VIA_KEYS).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

/** Resolves the device for a request's bearer token, or null when unknown or revoked. */
export async function deviceFromRequest(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(hpa_[A-Za-z0-9_-]{20,})$/)?.[1];
  if (!token) return null;
  await connectDb();
  const device = await AgentDevice.findOne({ tokenHash: sha256(token) }).lean();
  if (!device || device.revokedAt) return null;
  return device;
}

type Device = NonNullable<Awaited<ReturnType<typeof deviceFromRequest>>>;
type Fresh = { dataType: string; app: string; outcome: string };

/** How owners see who a device belongs to. */
export const deviceOwnerLabel = (device: { osUser?: string | null; enrolled?: boolean | null }, memberName?: string) =>
  memberName ?? (device.enrolled ? `${device.osUser || "Unknown user"} (company install)` : "Former member");

/**
 * Stores detections, folding repeats, and emails the organisation's owners
 * (throttled). Events the organisation's policy ignores are dropped, in case a
 * device hasn't picked up a policy change yet.
 */
export async function ingestAlerts(device: Device, events: z.infer<typeof alertsSchema>["events"]): Promise<number> {
  const now = Date.now();
  const policy = await getAgentPolicy(device.orgId);
  const fresh: Fresh[] = [];

  for (const e of events) {
    if (!policy.dataTypes.includes(e.dataType) || policy.allowedApps.includes(e.app)) continue;
    const source = e.source ?? (device.platform === "browser" ? "extension" : "agent");
    const outcome = e.outcome ?? "warned";
    // Clamp clock skew: nothing from the future, nothing older than a week.
    const at = new Date(Math.min(Math.max(e.occurredAt.getTime(), now - 7 * 86_400_000), now));
    const existing = await AgentAlert.findOneAndUpdate(
      { deviceId: device._id, dataType: e.dataType, app: e.app, outcome, via: e.via ?? null, lastOccurredAt: { $gte: new Date(at.getTime() - DEDUPE_MS) } },
      { $inc: { count: 1 }, $max: { lastOccurredAt: at } },
    );
    if (existing) continue;
    await AgentAlert.create({
      orgId: device.orgId,
      deviceId: device._id,
      userId: device.userId,
      dataType: e.dataType,
      app: e.app,
      severity: AGENT_DATA_TYPES[e.dataType as AgentDataType].severity,
      source,
      outcome,
      ...(e.via ? { via: e.via } : {}),
      occurredAt: at,
      lastOccurredAt: at,
      ...(outcome === "not_sensitive" ? { notSensitiveAt: at } : {}),
    });
    fresh.push({ dataType: e.dataType, app: e.app, outcome });
  }

  // The person said it was a false alarm, or sent it with the details hidden: recorded for owners, but no email.
  const emailable = fresh.filter((f) => f.outcome !== "not_sensitive" && f.outcome !== "masked");
  if (emailable.length && (!device.lastEmailAt || now - device.lastEmailAt.getTime() > EMAIL_EVERY_MS)) {
    await AgentDevice.updateOne({ _id: device._id }, { lastEmailAt: new Date(now) });
    await notifyOwners(device, emailable).catch((error) => log.error("agent.email_failed", { error: String(error) }));
  }
  return fresh.length;
}

async function notifyOwners(device: Device, items: Fresh[]) {
  const org = await Organization.findById(device.orgId).lean();
  if (!org) return;
  const ownerIds = org.members.filter((m) => m.role === "owner").map((m) => m.userId);
  const [owners, member] = await Promise.all([
    User.find({ _id: { $in: ownerIds } }).select("email").lean(),
    device.userId ? User.findById(device.userId).select("name").lean() : null,
  ]);
  const url = `${env().APP_URL}/dashboard/agent/alerts`;
  const memberName = member?.name ?? (device.enrolled ? deviceOwnerLabel(device) : "A team member");
  await Promise.allSettled(
    owners.map((o) => sendMail(agentAlertEmail({ to: o.email, orgName: org.name, memberName, device: device.hostname || "a computer", items, url }))),
  );
}
