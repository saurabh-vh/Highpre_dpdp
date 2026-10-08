import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Consent analytics against a real (in-memory) MongoDB: decision mix,
 * per-purpose and per-language rates, IST day buckets and the previous period.
 */
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("highpre-analytics-test");
  const { connectDb } = await import("@/lib/db");
  await connectDb();
});

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

// 12:00 IST on 8 Oct 2026. A 7-day window starts at 00:00 IST on 2 Oct (18:30 UTC on 1 Oct).
const now = new Date("2026-10-08T06:30:00Z");
const siteA = {
  _id: new Types.ObjectId(),
  name: "Shop",
  purposes: [
    { key: "necessary", name: "Necessary", essential: true },
    { key: "analytics", name: "Analytics", essential: false },
    { key: "ads", name: "Advertising", essential: false },
  ],
};
const siteB = {
  _id: new Types.ObjectId(),
  name: "Blog",
  purposes: [
    { key: "necessary", name: "Necessary", essential: true },
    { key: "analytics", name: "Site analytics", essential: false },
  ],
};

const d = (purpose: string, granted: boolean) => ({ purpose, granted });

async function seed() {
  const { ConsentRecord } = await import("@/models");
  let n = 0;
  const rec = (site: typeof siteA, at: string, action: "grant" | "update" | "withdraw", decisions: { purpose: string; granted: boolean }[], language: "en" | "hi" = "en") =>
    ConsentRecord.create({ siteId: site._id, principalId: `visitor-${++n}`, action, noticeVersion: 1, decisions, language, createdAt: new Date(at) });

  await Promise.all([
    // Current period.
    rec(siteA, "2026-10-08T04:00:00Z", "grant", [d("necessary", true), d("analytics", true), d("ads", true)]),
    rec(siteA, "2026-10-08T05:00:00Z", "grant", [d("necessary", true), d("analytics", false), d("ads", false)], "hi"),
    rec(siteA, "2026-10-06T10:00:00Z", "update", [d("necessary", true), d("analytics", true), d("ads", false)], "hi"),
    rec(siteA, "2026-10-01T18:40:00Z", "withdraw", [d("necessary", true), d("analytics", false), d("ads", false)]), // 00:10 IST on 2 Oct
    rec(siteB, "2026-10-05T10:00:00Z", "grant", [d("necessary", true), d("analytics", true)]),
    // Previous period.
    rec(siteA, "2026-10-01T18:20:00Z", "grant", [d("necessary", true), d("analytics", true), d("ads", true)]), // 23:50 IST on 1 Oct
    rec(siteA, "2026-09-26T10:00:00Z", "grant", [d("necessary", true), d("analytics", false), d("ads", false)]),
    // Before both periods: ignored.
    rec(siteA, "2026-09-20T10:00:00Z", "grant", [d("necessary", true), d("analytics", true), d("ads", true)]),
  ]);
}

describe("consentAnalytics", () => {
  beforeAll(seed);

  it("classifies decisions and compares with the previous period", async () => {
    const { consentAnalytics } = await import("@/lib/consent/analytics");
    const a = await consentAnalytics([siteA, siteB], 7, now);
    expect(a.total).toBe(5);
    expect(a.mix).toEqual({ accept: 2, reject: 1, custom: 1, withdraw: 1 });
    expect(a.previous).toEqual({ total: 2, mix: { accept: 1, reject: 1, custom: 0, withdraw: 0 } });
    expect(a.sites.map((s) => [s.name, s.total])).toEqual([["Shop", 4], ["Blog", 1]]);
  });

  it("zero-fills a daily series on Indian days", async () => {
    const { consentAnalytics } = await import("@/lib/consent/analytics");
    const a = await consentAnalytics([siteA, siteB], 7, now);
    expect(a.series.map((p) => p.day)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(a.series[0]).toMatchObject({ total: 1, withdraw: 1 });
    expect(a.series[1]).toEqual({ day: "2026-10-03", total: 0, accept: 0, reject: 0, custom: 0, withdraw: 0 });
    expect(a.series[6]).toMatchObject({ total: 2, accept: 1, reject: 1 });
    expect(a.series.reduce((s, p) => s + p.total, 0)).toBe(a.total);
  });

  it("reports opt-in per optional purpose, leaving out essential ones", async () => {
    const { consentAnalytics } = await import("@/lib/consent/analytics");
    const a = await consentAnalytics([siteA, siteB], 7, now);
    expect(a.purposes).toEqual([
      { key: "analytics", name: "Analytics", granted: 3, total: 5, rate: 0.6 },
      { key: "ads", name: "Advertising", granted: 1, total: 4, rate: 0.25 },
    ]);
  });

  it("groups by language with labels and accept-all rates", async () => {
    const { consentAnalytics } = await import("@/lib/consent/analytics");
    const a = await consentAnalytics([siteA, siteB], 7, now);
    expect(a.languages).toEqual([
      { code: "en", label: "English", total: 3, accepted: 2, rate: 2 / 3 },
      { code: "hi", label: "Hindi", total: 2, accepted: 0, rate: 0 },
    ]);
  });

  it("scopes to the sites passed in and handles none", async () => {
    const { consentAnalytics } = await import("@/lib/consent/analytics");
    const one = await consentAnalytics([siteB], 30, now);
    expect(one.total).toBe(1);
    expect(one.series).toHaveLength(30);
    const none = await consentAnalytics([], 7, now);
    expect(none.total).toBe(0);
    expect(none.series.every((p) => p.total === 0)).toBe(true);
  });
});
