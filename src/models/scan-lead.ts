import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Someone who asked for the PDF of a free public scan. Delivering the report
 * is the only use of the email unless `marketingConsent.granted` is true,
 * which records the separate, opt-in consent to product updates.
 * No admin UI yet: query directly (indexes below cover the usual lookups).
 */
const scanLeadSchema = new Schema({
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  url: { type: String, required: true },
  score: { type: Number, min: 0, max: 100, default: 0 },
  reportId: { type: String, required: true },
  marketingConsent: {
    granted: { type: Boolean, default: false },
    /** When the choice was made (also set when declined, as a record of the choice). */
    at: { type: Date },
    purpose: { type: String, default: "product_updates" },
    noticeVersion: { type: String },
    /** The exact checkbox wording shown. */
    text: { type: String },
  },
  /** Salted hash of the requester's IP; raw IPs are never stored. */
  ipHash: { type: String },
  createdAt: { type: Date, default: Date.now, immutable: true },
});

scanLeadSchema.index({ email: 1, createdAt: -1 });
scanLeadSchema.index({ createdAt: -1 });
scanLeadSchema.index({ "marketingConsent.granted": 1, createdAt: -1 });

export type ScanLeadDoc = InferSchemaType<typeof scanLeadSchema>;
export const ScanLead: Model<ScanLeadDoc> = models.ScanLead ?? model("ScanLead", scanLeadSchema);
