import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mail } from "@/lib/mail/mailer";

/**
 * AI tools report (company totals of which AI tools are used), uninstall
 * "goodbye" signals, computers not checking in, and the weekly owner digest.
 */
const sent: Mail[] = [];
vi.mock("@/lib/mail/mailer", () => ({ sendMail: async (m: Mail) => void sent.push(m) }));

let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("highpre-usage-test");
  const { connectDb } = await import("@/lib/db");
  await connectDb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

beforeEach(() => {
  sent.length = 0;
});

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
let n = 0;

async function setup(opts: { role?: "owner" | "admin" } = {}) {
  const { sha256 } = await import("@/lib/crypto");
  const { AgentDevice, Organization, User } = await import("@/models");
  n++;
  const owner = await User.create({ name: "Owner", email: `owner-u${n}-${Date.now()}@x.in`, passwordHash: "x" });
  const admin = await User.create({ name: "Admin", email: `admin-u${n}-${Date.now()}@x.in`, passwordHash: "x" });
  const org = await Organization.create({
    name: `Usage Org ${n}`,
    members: [
      { userId: owner._id, role: opts.role ?? "owner" },
      { userId: admin._id, role: "admin" },
    ],
  });
  const token = `hpa_${String(n).padStart(4, "0")}${"u".repeat(36)}`;
  const device = await AgentDevice.create({ orgId: org._id, userId: owner._id, tokenHash: sha256(token), platform: "browser", lastSeenAt: new Date() });
  return { org, owner, admin, token, device };
}

const post = (path: string, token: string | null, body: unknown) =>
  new Request(`http://x${path}`, {
    method: "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json", "x-real-ip": `10.1.0.${n}` },
    body: JSON.stringify(body),
  });

describe("usage report validation", () => {
  it("accepts only days and AI catalog keys", async () => {
    const { usageSchema, AI_APP_KEYS } = await import("@/lib/agent/usage");
    expect(AI_APP_KEYS).toContain("chatgpt");
    expect(AI_APP_KEYS).not.toContain("whatsapp");
    expect(usageSchema.safeParse({ days: [{ day: "2026-10-08", apps: ["chatgpt", "gemini"] }] }).success).toBe(true);
    expect(usageSchema.safeParse({ days: [] }).success).toBe(true);
    // Chat apps, unknown keys, extra fields, URLs and times are all refused.
    expect(usageSchema.safeParse({ days: [{ day: "2026-10-08", apps: ["whatsapp"] }] }).success).toBe(false);
    expect(usageSchema.safeParse({ days: [{ day: "2026-10-08", apps: ["chatgpt.com/c/123"] }] }).success).toBe(false);
    expect(usageSchema.safeParse({ days: [{ day: "2026-10-08", apps: ["chatgpt"], minutes: 40 }] }).success).toBe(false);
    expect(usageSchema.safeParse({ days: [{ day: "2026-10-08T10:00", apps: ["chatgpt"] }] }).success).toBe(false);
    expect(usageSchema.safeParse({ days: [], userAgent: "x" }).success).toBe(false);
    expect(usageSchema.safeParse({ days: Array(15).fill({ day: "2026-10-08", apps: ["chatgpt"] }) }).success).toBe(false);
  });

  it("lists the same AI apps as the Go agent", async () => {
    const { readFileSync } = await import("fs");
    const { AI_APP_KEYS } = await import("@/lib/agent/usage");
    const go = readFileSync("agent/usage.go", "utf8");
    for (const key of AI_APP_KEYS) expect(go, key).toContain(`"${key}": true`);
  });
});

describe("POST /api/agent/usage", () => {
  it("authenticates, validates, stores one row per device, day and app, and drops bad days", async () => {
    const { POST } = await import("@/app/api/agent/usage/route");
    const { AiUsage } = await import("@/models");
    const { token, device, owner } = await setup();

    expect((await POST(post("/api/agent/usage", null, { days: [] }))).status).toBe(401);
    expect((await POST(post("/api/agent/usage", token, { days: [{ day: day(-1), apps: ["whatsapp"] }] }))).status).toBe(422);

    const body = {
      days: [
        { day: day(-2), apps: ["chatgpt", "gemini"] },
        { day: day(-1), apps: ["chatgpt", "chatgpt"] },
        { day: day(5), apps: ["claude"] }, // future
        { day: day(-60), apps: ["claude"] }, // too old
        { day: "2026-02-30", apps: ["claude"] }, // not a date
      ],
    };
    const res = await POST(post("/api/agent/usage", token, body));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, stored: 3, ignored: false });
    // Sent again (a retry): nothing new.
    expect(await (await POST(post("/api/agent/usage", token, body))).json()).toMatchObject({ stored: 0 });

    const rows = await AiUsage.find({ deviceId: device._id }).sort({ day: 1, app: 1 }).lean();
    expect(rows.map((r) => [r.day, r.app])).toEqual([
      [day(-2), "chatgpt"],
      [day(-2), "gemini"],
      [day(-1), "chatgpt"],
    ]);
    expect(String(rows[0].userId)).toBe(String(owner._id));
    expect(Object.keys(rows[0]).sort()).toEqual(["__v", "_id", "app", "createdAt", "day", "deviceId", "orgId", "userId"]);
  });

  it("ignores reports when the organisation turned the report off", async () => {
    const { POST } = await import("@/app/api/agent/usage/route");
    const { AgentPolicy, AiUsage } = await import("@/models");
    const { org, token, device } = await setup();
    await AgentPolicy.create({ orgId: org._id, shareAiUsage: false });
    const res = await POST(post("/api/agent/usage", token, { days: [{ day: day(-1), apps: ["chatgpt"] }] }));
    expect(await res.json()).toMatchObject({ ok: true, stored: 0, ignored: true });
    expect(await AiUsage.countDocuments({ deviceId: device._id })).toBe(0);
  });
});

describe("aiToolTotals", () => {
  it("counts distinct people: one member's laptop and browser count once", async () => {
    const { aiToolTotals, popularUnapproved } = await import("@/lib/agent/usage");
    const { AgentDevice, AiUsage } = await import("@/models");
    const { org, owner, admin, device } = await setup();
    const laptop = await AgentDevice.create({ orgId: org._id, userId: owner._id, tokenHash: `t-laptop-${n}`, platform: "windows" });
    const adminPc = await AgentDevice.create({ orgId: org._id, userId: admin._id, tokenHash: `t-admin-${n}`, platform: "windows" });
    const frontDesk = await AgentDevice.create({ orgId: org._id, enrolled: true, osUser: "asha", tokenHash: `t-front-${n}`, platform: "windows" });
    const row = (d: { _id: Types.ObjectId; userId?: Types.ObjectId | null }, dd: string, app: string) => ({ orgId: org._id, deviceId: d._id, userId: d.userId ?? undefined, day: dd, app });
    await AiUsage.insertMany([
      row(device, day(-1), "chatgpt"),
      row(laptop, day(-1), "chatgpt"), // same person as the browser
      row(laptop, day(-3), "chatgpt"),
      row(adminPc, day(-2), "chatgpt"),
      row(frontDesk, day(-2), "chatgpt"),
      row(frontDesk, day(-2), "gemini"),
      row(adminPc, day(-45), "claude"), // older than 30 days
    ]);

    const totals = await aiToolTotals(org._id, 30);
    expect(totals.tools).toEqual([
      { app: "chatgpt", people: 3 },
      { app: "gemini", people: 1 },
    ]);
    expect(totals.people).toBe(3);
    expect(popularUnapproved(totals.tools, totals.people, [])).toEqual({ app: "chatgpt", people: 3 });
    expect(popularUnapproved(totals.tools, totals.people, ["chatgpt"])).toBeNull(); // approved; gemini isn't popular
  });
});

describe("goodbye", () => {
  it("records a desktop uninstall by token, without revoking", async () => {
    const { POST } = await import("@/app/api/agent/goodbye/route");
    const { AgentDevice } = await import("@/models");
    const { token, device } = await setup();
    expect((await POST(post("/api/agent/goodbye", null, {}))).status).toBe(401);
    expect((await POST(post("/api/agent/goodbye", token, {}))).status).toBe(200);
    const after = await AgentDevice.findById(device._id).lean();
    expect(after?.uninstalledAt).toBeInstanceOf(Date);
    expect(after?.revokedAt).toBeUndefined();
  });

  it("records an extension uninstall from its link, with the same page for any key", async () => {
    const { GET } = await import("@/app/api/agent/goodbye/route");
    const { sha256 } = await import("@/lib/crypto");
    const { AgentDevice } = await import("@/models");
    const { device } = await setup();
    const key = `hpu_${"k".repeat(32)}${n}`;
    await AgentDevice.updateOne({ _id: device._id }, { uninstallKeyHash: sha256(key) });
    const get = (k: string) => GET(new Request(`http://x/api/agent/goodbye?k=${encodeURIComponent(k)}`, { headers: { "x-real-ip": "10.2.0.1" } }));

    const wrong = await get(`hpu_${"z".repeat(32)}`);
    expect(wrong.status).toBe(200);
    const wrongPage = await wrong.text();
    expect((await AgentDevice.findById(device._id).lean())?.uninstalledAt).toBeUndefined();

    const res = await get(key);
    expect(res.headers.get("content-type")).toContain("text/html");
    const page = await res.text();
    expect(page).toContain("HighPre has been removed from this browser.");
    expect(page).toBe(wrongPage);
    const after = await AgentDevice.findById(device._id).lean();
    expect(after?.uninstalledAt).toBeInstanceOf(Date);
    expect(after?.revokedAt).toBeUndefined();
  });

  it("is cleared when the device checks in again (reinstalled)", async () => {
    const { POST } = await import("@/app/api/agent/heartbeat/route");
    const { AgentDevice } = await import("@/models");
    const { token, device } = await setup();
    await AgentDevice.updateOne({ _id: device._id }, { uninstalledAt: new Date() });
    const res = await POST(post("/api/agent/heartbeat", token, { hostname: "Chrome on Windows", osVersion: "Windows", agentVersion: "1.0.0" }));
    expect(res.status).toBe(200);
    expect((await res.json()).policy.shareAiUsage).toBe(true);
    expect((await AgentDevice.findById(device._id).lean())?.uninstalledAt).toBeUndefined();
  });
});

describe("stale computers", () => {
  it("flags computers that haven't checked in for a week, not removed or never-connected ones", async () => {
    const { isStale } = await import("@/lib/agent/usage");
    const now = Date.now();
    expect(isStale({ lastSeenAt: new Date(now - 8 * DAY) }, now)).toBe(true);
    expect(isStale({ lastSeenAt: new Date(now - 6 * DAY) }, now)).toBe(false);
    expect(isStale({ lastSeenAt: null }, now)).toBe(false);
    expect(isStale({ lastSeenAt: new Date(now - 30 * DAY), uninstalledAt: new Date() }, now)).toBe(false);
    expect(isStale({ lastSeenAt: new Date(now - 30 * DAY), revokedAt: new Date() }, now)).toBe(false);
  });
});

describe("weekly digest", () => {
  it("emails owners only, with company totals, at most once a week", async () => {
    const { runAgentDigests } = await import("@/lib/agent/digest");
    const { AgentAlert, AgentDevice, AiUsage } = await import("@/models");
    const { org, owner, device } = await setup();
    const now = new Date();
    await AgentDevice.create({ orgId: org._id, userId: owner._id, tokenHash: `t-stale-${n}`, platform: "windows", hostname: "OLD-PC", lastSeenAt: new Date(now.getTime() - 10 * DAY) });
    await AgentDevice.create({ orgId: org._id, userId: owner._id, tokenHash: `t-gone-${n}`, platform: "browser", lastSeenAt: new Date(now.getTime() - 2 * DAY), uninstalledAt: new Date(now.getTime() - DAY) });
    const alert = { orgId: org._id, deviceId: device._id, app: "chatgpt", severity: "high", occurredAt: now, lastOccurredAt: now } as const;
    await AgentAlert.insertMany([
      { ...alert, dataType: "card_number" as const, outcome: "stopped" as const, count: 2 },
      { ...alert, dataType: "aadhaar" as const, outcome: "blocked" as const },
      { ...alert, dataType: "password" as const, outcome: "not_sensitive" as const },
      { ...alert, dataType: "pan" as const, outcome: "stopped" as const, occurredAt: new Date(now.getTime() - 20 * DAY) }, // last month
    ]);
    await AiUsage.create({ orgId: org._id, deviceId: device._id, userId: owner._id, day: day(-1), app: "chatgpt" });

    await runAgentDigests(now);
    const mine = sent.filter((m) => m.text.includes(org.name) || m.subject.includes(org.name));
    expect(mine).toHaveLength(1); // the owner, not the admin
    expect(mine[0].to).toBe(owner.email);
    expect(mine[0].text).toContain("stopped private data from leaving 3 times");
    expect(mine[0].text).toContain("Payment card number: 2");
    expect(mine[0].text).toContain("Aadhaar number: 1");
    expect(mine[0].text).not.toContain("PAN");
    expect(mine[0].text).toContain("1 computer hasn't checked in for a week");
    expect(mine[0].text).toContain("1 computer had HighPre removed this week");
    expect(mine[0].text).toContain("ChatGPT: 1 person");
    expect(mine[0].text).not.toContain("Owner"); // no names
    expect(mine[0].text).toContain("https://app.example.in/dashboard/agent");

    // Hourly cron: not again this week, even with something new.
    sent.length = 0;
    await runAgentDigests(new Date(now.getTime() + 3_600_000));
    await runAgentDigests(new Date(now.getTime() + 3 * DAY));
    expect(sent.filter((m) => m.subject.includes(org.name))).toHaveLength(0);
    // A week later: yes.
    await runAgentDigests(new Date(now.getTime() + 7 * DAY));
    expect(sent.filter((m) => m.subject.includes(org.name))).toHaveLength(1);
  });

  it("stays quiet when there's nothing to say", async () => {
    const { buildAgentDigest, runAgentDigests } = await import("@/lib/agent/digest");
    const { org } = await setup();
    expect(await buildAgentDigest(org._id)).toBeNull();
    await runAgentDigests(new Date());
    expect(sent.filter((m) => m.subject.includes(org.name))).toHaveLength(0);
  });

  it("leaves AI tools out when the report is off", async () => {
    const { buildAgentDigest } = await import("@/lib/agent/digest");
    const { AgentPolicy, AiUsage } = await import("@/models");
    const { org, device, owner } = await setup();
    await AiUsage.create({ orgId: org._id, deviceId: device._id, userId: owner._id, day: day(-1), app: "gemini" });
    expect((await buildAgentDigest(org._id))?.aiTools).toEqual([{ app: "gemini", people: 1 }]);
    await AgentPolicy.create({ orgId: org._id, shareAiUsage: false });
    expect(await buildAgentDigest(org._id)).toBeNull();
  });
});
