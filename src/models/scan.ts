import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const findingSchema = new Schema(
  {
    id: { type: String, required: true },
    severity: { type: String, enum: ["critical", "warning", "pass"], required: true },
    title: { type: String, required: true },
    detail: { type: String, default: "" },
    /** "security" for the safeguards checks; unset for the DPDP checks. */
    group: { type: String },
  },
  { _id: false },
);

/** What changed since the site's previous complete scan (see lib/scanner/changes.ts). */
const changeSchema = new Schema(
  {
    kind: { type: String, required: true },
    severity: { type: String, enum: ["critical", "warning", "info"], required: true },
    message: { type: String, required: true },
  },
  { _id: false },
);

const scanSchema = new Schema(
  {
    // Null for anonymous scans run from the public landing page.
    siteId: { type: Schema.Types.ObjectId, ref: "Site", index: true },
    url: { type: String, required: true },
    status: { type: String, enum: ["complete", "failed"], required: true },
    error: { type: String },
    score: { type: Number, min: 0, max: 100, default: 0 },
    pagesScanned: { type: [String], default: [] },
    forms: {
      type: [{ page: String, fields: [String], _id: false }],
      default: [],
    },
    trackers: {
      type: [{ id: String, name: String, category: String, _id: false }],
      default: [],
    },
    cookies: { type: [String], default: [] },
    privacyNoticeUrl: { type: String },
    consentTool: { type: String },
    findings: { type: [findingSchema], default: [] },
    /** Security headers, TLS certificate, mixed content, insecure forms and cookies. */
    security: {
      headers: { missing: { type: [String], default: undefined }, present: { type: [String], default: undefined } },
      certificate: { validTo: Date, issuer: String, authorized: Boolean, error: String },
      mixedContent: { count: Number, examples: { type: [String], default: undefined } },
      insecureForms: { type: [String], default: undefined },
      insecureCookies: { type: [String], default: undefined },
    },
    /** Who started it: a person, or the weekly monitoring job. */
    trigger: { type: String, enum: ["manual", "scheduled"] },
    changes: { type: [changeSchema], default: [] },
  },
  { timestamps: true },
);

export type ScanDoc = InferSchemaType<typeof scanSchema>;
export const Scan: Model<ScanDoc> = models.Scan ?? model("Scan", scanSchema);
