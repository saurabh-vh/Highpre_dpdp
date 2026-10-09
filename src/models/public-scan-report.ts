import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { REPORT_TTL_SECONDS } from "@/lib/public-scan/constants";

const findingSchema = new Schema(
  {
    id: { type: String, required: true },
    severity: { type: String, enum: ["critical", "warning", "pass"], required: true },
    title: { type: String, required: true },
    detail: { type: String, default: "" },
    group: { type: String },
  },
  { _id: false },
);

/**
 * A shareable snapshot of a free public scan, served at /scan/r/<reportId>.
 * Anonymous and short-lived: MongoDB deletes it 30 days after creation.
 */
const publicScanReportSchema = new Schema({
  /** Random, unguessable public id (not the Mongo _id). */
  reportId: { type: String, required: true, unique: true },
  url: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, default: 0 },
  pagesScanned: { type: [String], default: [] },
  forms: { type: [{ page: String, fields: [String], _id: false }], default: [] },
  trackers: { type: [{ id: String, name: String, category: String, _id: false }], default: [] },
  privacyNoticeUrl: { type: String },
  consentTool: { type: String },
  findings: { type: [findingSchema], default: [] },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

publicScanReportSchema.index({ createdAt: 1 }, { expireAfterSeconds: REPORT_TTL_SECONDS });

export type PublicScanReportDoc = InferSchemaType<typeof publicScanReportSchema>;
export const PublicScanReport: Model<PublicScanReportDoc> =
  models.PublicScanReport ?? model("PublicScanReport", publicScanReportSchema);
