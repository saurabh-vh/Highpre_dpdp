import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { LANG_CODES } from "@/lib/i18n/languages";

/**
 * Append-only consent ledger. Records are never updated: a change of mind is
 * a new record. The visitor is identified only by a random first-party id the
 * widget generates; the IP address is stored as a salted hash. Each record
 * carries a content hash (see lib/consent/hash.ts) checked by the evidence pack.
 */
const consentRecordSchema = new Schema(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    principalId: { type: String, required: true, maxlength: 64 },
    action: { type: String, enum: ["grant", "update", "withdraw"], required: true },
    noticeVersion: { type: Number, required: true },
    decisions: {
      type: [{ purpose: String, granted: Boolean, _id: false }],
      default: [],
    },
    language: { type: String, enum: LANG_CODES, default: "en" },
    /** Set when the age gate is on: what the visitor declared. */
    ageGroup: { type: String, enum: ["adult", "child"] },
    /** For a child's consent given by a verified parent or guardian. */
    parentalConsentId: { type: Schema.Types.ObjectId, ref: "ParentalConsent" },
    /** Where consent was given. Unset means the banner (records from before form consent). */
    source: { type: String, enum: ["banner", "form"] },
    /** For form consent: the form's id, name or action path, and the receipt id sent with the lead as hp_consent_id. */
    formId: { type: String, maxlength: 100 },
    receiptId: { type: String, maxlength: 36 },
    pageUrl: { type: String, maxlength: 500 },
    ipHash: { type: String },
    userAgent: { type: String, maxlength: 300 },
    /** SHA-256 of the record's content, so later edits to stored evidence are detectable. */
    hash: { type: String },
    // Set explicitly (not via timestamps) because it's part of the content hash.
    createdAt: { type: Date, default: Date.now, immutable: true },
  },
);

consentRecordSchema.index({ siteId: 1, createdAt: -1 });
consentRecordSchema.index({ siteId: 1, principalId: 1, createdAt: -1 });
// One record per receipt: a replayed submission can't add a second record under the same id.
consentRecordSchema.index({ receiptId: 1 }, { unique: true, partialFilterExpression: { receiptId: { $type: "string" } } });

export type ConsentRecordDoc = InferSchemaType<typeof consentRecordSchema>;
export const ConsentRecord: Model<ConsentRecordDoc> =
  models.ConsentRecord ?? model("ConsentRecord", consentRecordSchema);
