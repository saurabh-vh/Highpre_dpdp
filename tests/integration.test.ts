import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Database-backed behaviour against a real (in-memory) MongoDB: the shared
 * rate limiter, the consent ledger's tamper check, subscription syncing and
 * one-time codes.
 */
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("highpre-test");
  const { connectDb } = await import("@/lib/db");
  await connectDb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

describe("rateLimit (MongoDB)", () => {
  it("counts across calls in one window and blocks over the limit", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const key = `test:${Date.now()}`;
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60_000)).allowed).toBe(true);
    const third = await rateLimit(key, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
    // The counter lives in MongoDB (not the in-process fallback).
    const { RateLimitBucket } = await import("@/models");
    expect((await RateLimitBucket.findOne({ key }).lean())?.count).toBe(3);
  });

  it("starts a fresh window once the old one expires", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const key = `test-expire:${Date.now()}`;
    await rateLimit(key, 1, 50);
    await new Promise((r) => setTimeout(r, 80));
    expect((await rateLimit(key, 1, 50)).allowed).toBe(true);
  });
});

describe("consent ledger integrity", () => {
  it("verifies stored records and detects an edited one", async () => {
    const { appendConsent } = await import("@/lib/consent/record");
    const { checkLedger } = await import("@/lib/evidence/pack");
    const { ConsentRecord } = await import("@/models");
    const siteId = new Types.ObjectId();
    const range = { from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) };

    const first = await appendConsent({ siteId, principalId: "visitor-aaaaaaaaaaaa", action: "grant", noticeVersion: 1, decisions: [{ purpose: "analytics", granted: true }], language: "en" });
    await appendConsent({ siteId, principalId: "visitor-bbbbbbbbbbbb", action: "withdraw", noticeVersion: 1, decisions: [{ purpose: "analytics", granted: false }], language: "hi" });

    let check = await checkLedger(siteId, range);
    expect(check).toMatchObject({ records: 2, verified: 2, mismatched: 0, legacy: 0 });

    // Someone flips a decision directly in the database.
    await ConsentRecord.collection.updateOne({ _id: first._id }, { $set: { "decisions.0.granted": false } });
    check = await checkLedger(siteId, range);
    expect(check.mismatched).toBe(1);
    expect(check.verified).toBe(1);
  });
});

describe("applySubscription", () => {
  it("promotes a paid checkout and ignores an abandoned one", async () => {
    const { applySubscription } = await import("@/lib/billing/sync");
    const { Organization } = await import("@/models");
    const org = await Organization.create({
      name: "Acme",
      plan: "starter",
      billing: { status: "active", subscriptionId: "sub_old", pendingSubscriptionId: "sub_new", pendingPlan: "growth" },
    });

    // An abandoned checkout must not touch the live subscription.
    await applySubscription({ id: "sub_new", plan_id: "plan_growth", status: "created" });
    let doc = await Organization.findById(org._id).lean();
    expect(doc?.plan).toBe("starter");
    expect(doc?.billing?.subscriptionId).toBe("sub_old");

    // Paid: the new subscription replaces the old one and the plan changes.
    const result = await applySubscription({ id: "sub_new", plan_id: "plan_growth", status: "active", current_end: 1_900_000_000 });
    expect(result?.activatedCheckout).toBe(true);
    doc = await Organization.findById(org._id).lean();
    expect(doc?.plan).toBe("growth");
    expect(doc?.billing?.subscriptionId).toBe("sub_new");
    expect(doc?.billing?.pendingSubscriptionId).toBeUndefined();
    expect(doc?.billing?.currentPeriodEnd?.getTime()).toBe(1_900_000_000_000);

    // Payments fail later: status recorded; effectivePlan treats "halted" as Free.
    await applySubscription({ id: "sub_new", plan_id: "plan_growth", status: "halted" });
    doc = await Organization.findById(org._id).lean();
    expect(doc?.billing?.status).toBe("halted");

    // Subscription ends: back to Free.
    await applySubscription({ id: "sub_new", plan_id: "plan_growth", status: "completed" });
    expect((await Organization.findById(org._id).lean())?.plan).toBe("free");
  });

  it("returns null for subscriptions nobody owns", async () => {
    const { applySubscription } = await import("@/lib/billing/sync");
    expect(await applySubscription({ id: "sub_unknown", plan_id: "plan_growth", status: "active" })).toBeNull();
  });
});

describe("one-time codes", () => {
  it("accepts the right code once, rejects wrong codes and other flows", async () => {
    const { issueOtp, verifyOtp } = await import("@/lib/otp");
    const code = (await issueOtp("parental", "sitekey123", "parent@x.in"))!;
    expect(code).toMatch(/^\d{6}$/);
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await verifyOtp("parental", "sitekey123", "parent@x.in", wrong)).toBe("wrong");
    expect(await verifyOtp("rights", "sitekey123", "parent@x.in", code)).toBe("expired");
    expect(await verifyOtp("parental", "sitekey123", "parent@x.in", code)).toBe("ok");
    expect(await verifyOtp("parental", "sitekey123", "parent@x.in", code)).toBe("expired");
  });

  it("locks out after five wrong guesses", async () => {
    const { issueOtp, verifyOtp } = await import("@/lib/otp");
    const code = (await issueOtp("rights", "sitekey456", "who@x.in"))!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await verifyOtp("rights", "sitekey456", "who@x.in", wrong);
    expect(await verifyOtp("rights", "sitekey456", "who@x.in", code)).toBe("expired");
  });
});

describe("desktop agent ingestion", () => {
  it("authenticates by token, folds repeats and ignores removed devices", async () => {
    const { deviceFromRequest, ingestAlerts } = await import("@/lib/agent/ingest");
    const { sha256 } = await import("@/lib/crypto");
    const { AgentAlert, AgentDevice, Organization, User } = await import("@/models");

    const owner = await User.create({ name: "Owner", email: `owner${Date.now()}@x.in`, passwordHash: "x" });
    const org = await Organization.create({ name: "Agent Org", members: [{ userId: owner._id, role: "owner" }] });
    const token = "hpa_" + "a".repeat(40);
    const device = await AgentDevice.create({ orgId: org._id, userId: owner._id, tokenHash: sha256(token), platform: "windows", hostname: "LAPTOP" });

    const req = (t: string) => new Request("http://x/api/agent/alerts", { headers: { authorization: `Bearer ${t}` } });
    expect(await deviceFromRequest(req("hpa_" + "b".repeat(40)))).toBeNull();
    const found = await deviceFromRequest(req(token));
    expect(String(found?._id)).toBe(String(device._id));

    const at = new Date();
    const stored = await ingestAlerts(found!, [
      { dataType: "card_number", app: "chatgpt", occurredAt: at },
      { dataType: "card_number", app: "chatgpt", occurredAt: new Date(at.getTime() + 1000) },
      { dataType: "aadhaar", app: "whatsapp", occurredAt: at },
    ]);
    expect(stored).toBe(2);
    const card = await AgentAlert.findOne({ deviceId: device._id, dataType: "card_number" }).lean();
    expect(card?.count).toBe(2);
    expect(card?.severity).toBe("high");

    await AgentDevice.updateOne({ _id: device._id }, { revokedAt: new Date() });
    expect(await deviceFromRequest(req(token))).toBeNull();
  });

  it("applies the organisation's policy and records extension outcomes", async () => {
    const { ingestAlerts } = await import("@/lib/agent/ingest");
    const { AgentAlert, AgentDevice, AgentPolicy, Organization, User } = await import("@/models");
    const owner = await User.create({ name: "Owner", email: `policy${Date.now()}@x.in`, passwordHash: "x" });
    const org = await Organization.create({ name: "Policy Org", members: [{ userId: owner._id, role: "owner" }] });
    await AgentPolicy.create({ orgId: org._id, dataTypes: ["card_number", "password"], allowedApps: ["claude"] });
    const device = (await AgentDevice.create({ orgId: org._id, userId: owner._id, tokenHash: `h${Date.now()}`, platform: "browser" })).toObject();

    const at = new Date();
    const stored = await ingestAlerts(device, [
      { dataType: "pan", app: "chatgpt", occurredAt: at }, // not watched
      { dataType: "card_number", app: "claude", occurredAt: at }, // approved tool
      { dataType: "card_number", app: "chatgpt", occurredAt: at, outcome: "stopped" },
      { dataType: "password", app: "gemini", occurredAt: at, source: "extension", outcome: "not_sensitive" },
    ]);
    expect(stored).toBe(2);
    const alerts = await AgentAlert.find({ deviceId: device._id }).sort({ dataType: 1 }).lean();
    expect(alerts.map((a) => [a.dataType, a.source, a.outcome])).toEqual([
      ["card_number", "extension", "stopped"],
      ["password", "extension", "not_sensitive"],
    ]);
    expect(alerts[1].notSensitiveAt).toBeInstanceOf(Date);
  });

  it("enrols company installs with a derived key, reuses the device and keeps removed computers out", async () => {
    const { POST } = await import("@/app/api/agent/enroll/route");
    const { enrollKeyFor, parseEnrollKey } = await import("@/lib/agent/policy");
    const { AgentDevice, AgentPolicy, Organization, User } = await import("@/models");
    const owner = await User.create({ name: "Owner", email: `enrol${Date.now()}@x.in`, passwordHash: "x" });
    const org = await Organization.create({ name: "Enrol Org", members: [{ userId: owner._id, role: "owner" }] });
    const other = await Organization.create({ name: "Other Org", members: [] });

    const key = enrollKeyFor(org._id, 1);
    expect(parseEnrollKey(key)).toEqual({ orgId: String(org._id), version: 1 });
    expect(parseEnrollKey(key.replace(String(org._id), String(other._id)))).toBeNull(); // can't be moved to another org
    expect(parseEnrollKey(key.slice(0, -1) + (key.endsWith("A") ? "B" : "A"))).toBeNull();

    const body = (enrollKey: string, extra: Record<string, unknown> = {}) =>
      new Request("http://x/api/agent/enroll", {
        method: "POST",
        headers: { "x-real-ip": `10.0.0.${Math.floor(Math.random() * 200)}` },
        body: JSON.stringify({ enrollKey, hostname: "FRONTDESK-01", osUser: "asha", osVersion: "Windows 11", agentVersion: "1.1.0", platform: "windows", ...extra }),
      });

    expect((await POST(body(key))).status).toBe(403); // company installs not turned on yet
    await AgentPolicy.create({ orgId: org._id, enrollmentEnabled: true });
    expect((await POST(body(key, { clipboard: "secret" }))).status).toBe(422); // strict body

    const first = await POST(body(key));
    expect(first.status).toBe(200);
    const { token } = await first.json();
    expect(token).toMatch(/^hpa_/);
    const again = await POST(body(key)); // reinstall on the same computer and account
    expect((await again.json()).token).not.toBe(token);
    const devices = await AgentDevice.find({ orgId: org._id }).lean();
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ enrolled: true, osUser: "asha", hostname: "FRONTDESK-01", platform: "windows" });
    expect(devices[0].userId).toBeUndefined();

    await AgentDevice.updateOne({ _id: devices[0]._id }, { revokedAt: new Date() });
    expect((await POST(body(key))).status).toBe(410); // removed computers stay off

    // Rotating the key retires old installers and lets removed computers rejoin with the new one.
    await AgentPolicy.updateOne({ orgId: org._id }, { $inc: { enrollKeyVersion: 1 }, $set: { enrollKeyRotatedAt: new Date() } });
    expect((await POST(body(key))).status).toBe(403);
    expect((await POST(body(enrollKeyFor(org._id, 2)))).status).toBe(200);
  });

  it("offers only signed, newer builds as updates", async () => {
    const { mkdtempSync, writeFileSync } = await import("fs");
    const { tmpdir } = await import("os");
    const { join } = await import("path");
    const dir = mkdtempSync(join(tmpdir(), "agent-dist-"));
    process.env.AGENT_DIST_DIR = dir;
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ version: "1.2.0", updatesSigned: true, files: { windows: { file: "a.exe", sha256: "ab", size: 2, signature: "c2ln" }, "mac-arm64": { file: "b", sha256: "cd", size: 2 } } }),
    );
    const { updateOffer } = await import("@/lib/agent/update");
    expect(await updateOffer("windows", "1.1.0")).toMatchObject({ version: "1.2.0", signature: "c2ln" });
    expect(await updateOffer("windows", "1.2.0")).toBeNull();
    expect(await updateOffer("mac-arm64", "1.0.0")).toBeNull(); // unsigned
    delete process.env.AGENT_DIST_DIR;
  });
});
