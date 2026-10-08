import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { LANG_CODES } from "@/lib/i18n/languages";

/**
 * Consent given by a parent or lawful guardian for a visitor who declared
 * they're under 18 (DPDP s.9). The parent proves control of their email with
 * a one-time code and declares they're an adult and the child's guardian.
 */
const parentalConsentSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    /** The child's widget visitor id. */
    principalId: { type: String, required: true, maxlength: 64 },
    parentName: { type: String, required: true, trim: true, maxlength: 120 },
    parentEmail: { type: String, required: true, lowercase: true, trim: true },
    relationship: { type: String, enum: ["parent", "guardian"], required: true },
    childName: { type: String, trim: true, maxlength: 80, default: "" },
    decisions: { type: [{ purpose: String, granted: Boolean, _id: false }], default: [] },
    noticeVersion: { type: Number, required: true },
    language: { type: String, enum: LANG_CODES, default: "en" },
    /** The exact declaration text the parent confirmed. */
    declaration: { type: String, required: true },
    emailVerifiedAt: { type: Date, required: true },
    ipHash: { type: String },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

parentalConsentSchema.index({ siteId: 1, principalId: 1, createdAt: -1 });

export type ParentalConsentDoc = InferSchemaType<typeof parentalConsentSchema>;
export const ParentalConsent: Model<ParentalConsentDoc> =
  models.ParentalConsent ?? model("ParentalConsent", parentalConsentSchema);
