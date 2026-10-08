import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const findingSchema = new Schema(
  {
    id: { type: String, required: true },
    severity: { type: String, enum: ["critical", "warning", "pass"], required: true },
    title: { type: String, required: true },
    detail: { type: String, default: "" },
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
  },
  { timestamps: true },
);

export type ScanDoc = InferSchemaType<typeof scanSchema>;
export const Scan: Model<ScanDoc> = models.Scan ?? model("Scan", scanSchema);
