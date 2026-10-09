import { createHash, randomUUID } from "crypto";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Form consent against a real (in-memory) MongoDB: the public consent API
 * recording form submissions, and the ledger check verifying both records
 * written before form consent existed and new form records.
 */
let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("highpre-forms-test");
  const { connectDb } = await import("@/lib/db");
  await connectDb();
  const { ConsentRecord } = await import("@/models");
  await ConsentRecord.init(); // build the unique receipt index before the replay test
});

afterAll(async () => {
  await mongoose.disconnect();
  await server?.stop();
});

let ip = 0;
async function post(body: unknown) {
  const { POST } = await import("@/app/api/public/consent/route");
  // A fresh client IP per call keeps the rate limiter out of the way.
  return POST(new Request("http://x/api/public/consent", { method: "POST", headers: { "x-real-ip": `10.9.0.${++ip}` }, body: JSON.stringify(body) }));
}

async function makeSite() {
  const { Site } = await import("@/models");
  const siteKey = `forms${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return Site.create({
    orgId: new Types.ObjectId(),
    name: "Shop",
    url: "https://shop.in",
    siteKey,
    publishedNoticeVersion: 1,
    purposes: [
      { key: "contact", name: "Replying to you", description: "To answer your enquiry.", essential: true },
      { key: "marketing", name: "Offers", description: "Occasional offers by email." },
    ],
    forms: { autoProtect: true, purposes: ["contact", "marketing"], requiredPurposes: ["contact"] },
  });
}

describe("consent API: form submissions", () => {
  it("records a form submission with its form id and receipt id", async () => {
    const { ConsentRecord } = await import("@/models");
    const site = await makeSite();
    const receiptId = randomUUID();
    const res = await post({
      siteKey: site.siteKey,
      principalId: "visitor-formaaaaaaaaaaaa",
      action: "grant",
      noticeVersion: 1,
      decisions: [
        { purpose: "contact", granted: true },
        { purpose: "marketing", granted: false },
        { purpose: "unknown", granted: true },
      ],
      language: "hi",
      pageUrl: "https://shop.in/contact",
      source: "form",
      formId: "enquiry",
      receiptId,
    });
    expect(res.status).toBe(201);
    const record = await ConsentRecord.findOne({ receiptId }).lean();
    expect(record).toMatchObject({ source: "form", formId: "enquiry", receiptId, language: "hi", action: "grant" });
    // Recorded exactly as ticked; unknown purposes dropped.
    expect(record?.decisions).toEqual([
      { purpose: "contact", granted: true },
      { purpose: "marketing", granted: false },
    ]);

    // Replaying the same receipt doesn't add a second record.
    const again = await post({ siteKey: site.siteKey, principalId: "visitor-formaaaaaaaaaaaa", action: "grant", noticeVersion: 1, decisions: [{ purpose: "marketing", granted: true }], source: "form", formId: "enquiry", receiptId });
    expect(again.status).toBe(409);
    expect(await ConsentRecord.countDocuments({ receiptId })).toBe(1);
  });

  it("rejects malformed form fields and form events with no known purposes", async () => {
    const site = await makeSite();
    const base = { siteKey: site.siteKey, principalId: "visitor-formbbbbbbbbbbbb", action: "grant", noticeVersion: 1, decisions: [{ purpose: "marketing", granted: true }] };
    expect((await post({ ...base, source: "form", formId: "f", receiptId: "123" })).status).toBe(422);
    expect((await post({ ...base, source: "form", formId: "x".repeat(101), receiptId: randomUUID() })).status).toBe(422);
    expect((await post({ ...base, source: "form", receiptId: randomUUID() })).status).toBe(422);
    expect((await post({ ...base, source: "chat", formId: "f", receiptId: randomUUID() })).status).toBe(422);
    expect((await post({ ...base, formId: "f" })).status).toBe(422);
    expect((await post({ ...base, decisions: [{ purpose: "nope", granted: true }], source: "form", formId: "f", receiptId: randomUUID() })).status).toBe(422);
  });

  it("still records banner events as before", async () => {
    const { ConsentRecord } = await import("@/models");
    const site = await makeSite();
    const res = await post({ siteKey: site.siteKey, principalId: "visitor-bannercccccccccc", action: "grant", noticeVersion: 1, decisions: [{ purpose: "contact", granted: false }, { purpose: "marketing", granted: true }] });
    expect(res.status).toBe(201);
    const record = await ConsentRecord.findOne({ siteId: site._id, principalId: "visitor-bannercccccccccc" }).lean();
    expect(record?.source).toBeUndefined();
    expect(record?.receiptId).toBeUndefined();
    expect(record?.decisions[0]).toEqual({ purpose: "contact", granted: true }); // essential stays on in the banner
  });
});

describe("ledger check with form records", () => {
  it("verifies records from before form consent and new form records, and detects edits to form fields", async () => {
    const { appendConsent } = await import("@/lib/consent/record");
    const { checkLedger } = await import("@/lib/evidence/pack");
    const { ConsentRecord } = await import("@/models");
    const siteId = new Types.ObjectId();
    const range = { from: new Date(Date.now() - 60_000), to: new Date(Date.now() + 60_000) };

    // A record exactly as the pre-form-consent code wrote it, hash and all.
    const createdAt = new Date();
    const legacyHash = createHash("sha256")
      .update(JSON.stringify([String(siteId), "visitor-olddddddddddddd", "grant", 1, [["analytics", true]], "en", "", "", createdAt.toISOString()]))
      .digest("hex");
    await ConsentRecord.collection.insertOne({
      siteId,
      principalId: "visitor-olddddddddddddd",
      action: "grant",
      noticeVersion: 1,
      decisions: [{ purpose: "analytics", granted: true }],
      language: "en",
      createdAt,
      hash: legacyHash,
    });

    const form = await appendConsent({
      siteId,
      principalId: "visitor-neweeeeeeeeeeee",
      action: "grant",
      noticeVersion: 1,
      decisions: [{ purpose: "marketing", granted: true }],
      language: "ta",
      source: "form",
      formId: "newsletter",
      receiptId: randomUUID(),
    });

    let check = await checkLedger(siteId, range);
    expect(check).toMatchObject({ records: 2, verified: 2, mismatched: 0, legacy: 0 });

    // Someone re-labels the form a lead came from.
    await ConsentRecord.collection.updateOne({ _id: form._id }, { $set: { formId: "contact" } });
    check = await checkLedger(siteId, range);
    expect(check).toMatchObject({ verified: 1, mismatched: 1 });

    // Or strips the receipt so the record passes for a banner choice.
    await ConsentRecord.collection.updateOne({ _id: form._id }, { $set: { formId: "newsletter" }, $unset: { receiptId: "", source: "" } });
    check = await checkLedger(siteId, range);
    expect(check).toMatchObject({ verified: 1, mismatched: 1 });
  });
});
