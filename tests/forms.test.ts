import { createHash, webcrypto } from "crypto";
import { describe, expect, it } from "vitest";
import { fieldKind, formIdentifier, formPayload, isAutoEligible, isExcludedForm, missingRequired, resolvePurposes, splitKeys, uuid } from "../widget/src/forms.js";
import { formAttributeSnippet, formsConfig, suggestedFormPurposes } from "@/lib/consent/forms";
import { consentHash } from "@/lib/consent/hash";
import { consentEventSchema } from "@/lib/validation";

/** Form consent: the widget's pure detection logic, site settings, validation and hashing. */

const field = (type: string, name = "", extra: Record<string, string> = {}) => ({ type, name, ...extra });

describe("fieldKind", () => {
  it("recognises email, phone and name fields", () => {
    expect(fieldKind(field("email"))).toBe("email");
    expect(fieldKind(field("text", "your-email"))).toBe("email");
    expect(fieldKind(field("tel"))).toBe("tel");
    expect(fieldKind(field("text", "mobile_number"))).toBe("tel");
    expect(fieldKind(field("text", "", { placeholder: "WhatsApp number" }))).toBe("tel");
    expect(fieldKind(field("text", "name"))).toBe("name");
    expect(fieldKind(field("text", "first_name"))).toBe("name");
    expect(fieldKind(field("text", "", { autocomplete: "given-name" }))).toBe("name");
    expect(fieldKind(field("text", "", { ariaLabel: "Full name" }))).toBe("name");
  });

  it("ignores fields that aren't personal data", () => {
    expect(fieldKind(field("text", "username"))).toBeNull();
    expect(fieldKind(field("text", "company_name"))).toBeNull();
    expect(fieldKind(field("hidden", "email"))).toBeNull();
    expect(fieldKind(field("checkbox", "email_updates"))).toBeNull();
    expect(fieldKind(field("text", "hotel"))).toBeNull();
    expect(fieldKind(field("text", "city"))).toBeNull();
    expect(fieldKind(field("password", "name"))).toBeNull();
  });
});

describe("form eligibility", () => {
  const contact = { id: "contact", fields: [field("text", "name"), field("email", "email"), field("textarea", "message"), field("submit")] };

  it("protects lead forms automatically", () => {
    expect(isAutoEligible(contact)).toBe(true);
    expect(isAutoEligible({ fields: [field("tel", "phone")] })).toBe(true);
  });

  it("skips forms without personal data", () => {
    expect(isAutoEligible({ fields: [field("text", "city"), field("number", "guests")] })).toBe(false);
    expect(isAutoEligible({ fields: [] })).toBe(false);
  });

  it("never touches search, login or password forms", () => {
    expect(isExcludedForm({ fields: [field("email", "email"), field("password", "password")] })).toBe(true);
    expect(isExcludedForm({ role: "search", fields: [field("text", "name")] })).toBe(true);
    expect(isExcludedForm({ fields: [field("search", "q")] })).toBe(true);
    expect(isExcludedForm({ fields: [field("text", "s"), field("submit")] })).toBe(true);
    expect(isExcludedForm({ id: "login-form", fields: [field("email", "email")] })).toBe(true);
    expect(isExcludedForm({ action: "/wp-login.php", fields: [field("text", "log")] })).toBe(true);
    expect(isExcludedForm({ className: "header-search", fields: [field("text", "name")] })).toBe(true);
    expect(isAutoEligible({ action: "/account/signin", fields: [field("email", "email")] })).toBe(false);
    expect(isExcludedForm(contact)).toBe(false);
  });
});

describe("formIdentifier", () => {
  it("uses id, then name, then the action path", () => {
    expect(formIdentifier({ id: "enquiry", name: "x", action: "/send" }, "https://shop.in/contact")).toBe("enquiry");
    expect(formIdentifier({ name: "lead" }, "https://shop.in/")).toBe("lead");
    expect(formIdentifier({ action: "https://forms.example.com/f/abc?x=1" }, "https://shop.in/")).toBe("/f/abc");
    expect(formIdentifier({ action: "send.php" }, "https://shop.in/contact/")).toBe("/contact/send.php");
    expect(formIdentifier({}, "https://shop.in/book")).toBe("/book");
  });

  it("keeps identifiers within the ledger's limit", () => {
    expect(formIdentifier({ id: "x".repeat(300) }).length).toBe(100);
  });
});

describe("resolvePurposes", () => {
  const config = {
    purposes: [{ key: "contact" }, { key: "marketing" }, { key: "analytics" }],
    forms: { auto: true, purposes: ["contact", "marketing"], required: ["contact"] },
  };

  it("uses the attribute's purposes, dropping unknown ones", () => {
    expect(resolvePurposes({ consent: "marketing, nope ,marketing", required: null, auto: false }, config)).toEqual([{ key: "marketing", required: false }]);
  });

  it("falls back to the dashboard purposes for an empty attribute or automatic protection", () => {
    const expected = [{ key: "contact", required: true }, { key: "marketing", required: false }];
    expect(resolvePurposes({ consent: "", required: null, auto: false }, config)).toEqual(expected);
    expect(resolvePurposes({ consent: null, required: null, auto: true }, config)).toEqual(expected);
  });

  it("lets data-hp-required override the site setting", () => {
    expect(resolvePurposes({ consent: "contact,marketing", required: "marketing", auto: false }, config)).toEqual([
      { key: "contact", required: false },
      { key: "marketing", required: true },
    ]);
    expect(resolvePurposes({ consent: "contact,marketing", required: "*", auto: false }, config).every((p) => p.required)).toBe(true);
    expect(resolvePurposes({ consent: "contact", required: "", auto: false }, config)).toEqual([{ key: "contact", required: false }]);
  });

  it("does nothing for unmarked forms, opted-out forms or sites without form purposes", () => {
    expect(resolvePurposes({ consent: null, required: null, auto: false }, config)).toEqual([]);
    expect(resolvePurposes({ consent: "off", required: null, auto: true }, config)).toEqual([]);
    expect(resolvePurposes({ consent: null, required: null, auto: true }, { purposes: config.purposes, forms: { purposes: [] } })).toEqual([]);
    expect(resolvePurposes({ consent: "", required: null, auto: false }, { purposes: config.purposes })).toEqual([]);
    expect(resolvePurposes({ consent: "marketing", required: null, auto: false }, { purposes: [] })).toEqual([]);
  });
});

describe("submission", () => {
  const purposes = [{ key: "contact", required: true }, { key: "marketing", required: false }];

  it("blocks only on unticked required boxes", () => {
    expect(missingRequired(purposes, {})).toEqual(["contact"]);
    expect(missingRequired(purposes, { marketing: true })).toEqual(["contact"]);
    expect(missingRequired(purposes, { contact: true })).toEqual([]);
  });

  it("generates v4 UUIDs, with or without randomUUID", () => {
    const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const noRandomUUID = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) } as Parameters<typeof uuid>[0];
    const ids = new Set(Array.from({ length: 50 }, () => uuid(noRandomUUID)));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(v4);
    expect(uuid(webcrypto as unknown as Parameters<typeof uuid>[0])).toMatch(v4);
  });

  it("builds a payload the consent API accepts", () => {
    const payload = formPayload({
      siteKey: "site_key_123",
      principalId: "visitor-abcdefghijklmnop",
      version: 2,
      purposes,
      checked: { contact: true },
      lang: "hi",
      pageUrl: "https://shop.in/contact",
      formId: "enquiry",
      receiptId: uuid(webcrypto as unknown as Parameters<typeof uuid>[0]),
    });
    const parsed = consentEventSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.decisions).toEqual([{ purpose: "contact", granted: true }, { purpose: "marketing", granted: false }]);
    expect(parsed.data?.source).toBe("form");
  });

  it("splits attribute lists", () => {
    expect(splitKeys(" a, b,,a ,c ")).toEqual(["a", "b", "c"]);
    expect(splitKeys(null)).toEqual([]);
  });
});

describe("consent API validation of form fields", () => {
  const base = { siteKey: "site_key_123", principalId: "visitor-abcdefghijklmnop", action: "grant", noticeVersion: 1, decisions: [{ purpose: "contact", granted: true }] };
  const receiptId = "0b6f3c1e-7f1a-4c2b-9d3e-5a6b7c8d9e0f";

  it("accepts banner events unchanged and well-formed form events", () => {
    expect(consentEventSchema.parse(base).source).toBe("banner");
    expect(consentEventSchema.safeParse({ ...base, source: "form", formId: "contact-form", receiptId }).success).toBe(true);
  });

  it.each([
    ["an unknown source", { source: "popup", formId: "f", receiptId }],
    ["a form event without a receipt", { source: "form", formId: "f" }],
    ["a form event without a form id", { source: "form", receiptId }],
    ["a receipt that isn't a UUID", { source: "form", formId: "f", receiptId: "not-a-uuid" }],
    ["an over-long form id", { source: "form", formId: "f".repeat(101), receiptId }],
    ["a form id with control characters", { source: "form", formId: "a\nb", receiptId }],
    ["a blank form id", { source: "form", formId: "   ", receiptId }],
    ["form fields on a banner event", { formId: "f", receiptId }],
    ["a form event that isn't a grant", { source: "form", formId: "f", receiptId, action: "withdraw" }],
  ])("rejects %s", (_label, extra) => {
    expect(consentEventSchema.safeParse({ ...base, ...extra }).success).toBe(false);
  });
});

describe("form settings", () => {
  const purposes = [
    { key: "contact", essential: true },
    { key: "marketing" },
    { key: "analytics", tracking: true },
  ];

  it("only sends purposes that still exist, and automatic mode only with purposes", () => {
    expect(formsConfig(purposes, { autoProtect: true, purposes: ["marketing", "gone"], requiredPurposes: ["gone"] })).toEqual({ auto: true, purposes: ["marketing"], required: [] });
    expect(formsConfig(purposes, { autoProtect: true, purposes: [] }).auto).toBe(false);
    expect(formsConfig(purposes, undefined)).toEqual({ auto: false, purposes: [], required: [] });
  });

  it("suggests chosen purposes, else optional non-tracking ones", () => {
    expect(suggestedFormPurposes(purposes, { purposes: ["contact"] })).toEqual(["contact"]);
    expect(suggestedFormPurposes(purposes, null)).toEqual(["marketing"]);
    expect(formAttributeSnippet(["contact", "marketing"], ["contact", "other"])).toBe('<form data-hp-consent="contact,marketing" data-hp-required="contact">');
  });
});

describe("consentHash with form fields", () => {
  const record = { siteId: "s1", principalId: "p1", action: "grant", noticeVersion: 1, decisions: [{ purpose: "a", granted: true }], language: "en", createdAt: new Date("2026-01-01T00:00:00Z") };

  it("hashes banner records exactly as before form consent existed", () => {
    // The canonical form used before the form fields were added.
    const legacy = createHash("sha256")
      .update(JSON.stringify(["s1", "p1", "grant", 1, [["a", true]], "en", "", "", "2026-01-01T00:00:00.000Z"]))
      .digest("hex");
    expect(consentHash(record)).toBe(legacy);
    expect(consentHash({ ...record, source: null, formId: undefined, receiptId: null })).toBe(legacy);
  });

  it("covers the form fields", () => {
    const form = { ...record, source: "form", formId: "contact", receiptId: "0b6f3c1e-7f1a-4c2b-9d3e-5a6b7c8d9e0f" };
    const h = consentHash(form);
    expect(h).not.toBe(consentHash(record));
    expect(consentHash({ ...form, formId: "other" })).not.toBe(h);
    expect(consentHash({ ...form, receiptId: "1b6f3c1e-7f1a-4c2b-9d3e-5a6b7c8d9e0f" })).not.toBe(h);
  });
});
