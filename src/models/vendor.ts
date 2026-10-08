import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { DPA_STATUS_VALUES, VENDOR_CATEGORY_VALUES } from "@/lib/vendors/constants";

/**
 * A third party that processes personal data for the organisation (a "data
 * processor" under DPDP s.8(2)), with the state of its data processing
 * agreement. Created by website scans or added by hand.
 */
const vendorSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, enum: VENDOR_CATEGORY_VALUES, default: "other" },
    website: { type: String, trim: true, default: "" },
    source: { type: String, enum: ["scan", "manual"], required: true },
    /** Scanner signature id (e.g. "ga4") for detected vendors; one vendor per signature per org. */
    signatureKey: { type: String },
    /** Sites whose latest scan found this vendor. */
    siteIds: { type: [Schema.Types.ObjectId], ref: "Site", default: [] },
    firstDetectedAt: { type: Date },
    lastDetectedAt: { type: Date },
    dataShared: { type: String, trim: true, maxlength: 500, default: "" },
    processingCountry: { type: String, trim: true, maxlength: 80, default: "" },
    dpaStatus: { type: String, enum: DPA_STATUS_VALUES, default: "not_started" },
    dpaSignedAt: { type: Date },
    dpaRenewalAt: { type: Date },
    /** The renewal date a reminder was last emailed for, so a new date triggers a new reminder. */
    renewalReminderFor: { type: Date },
    contactEmail: { type: String, trim: true, lowercase: true, default: "" },
    notes: { type: String, trim: true, maxlength: 2000, default: "" },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);

vendorSchema.index({ orgId: 1, signatureKey: 1 }, { unique: true, partialFilterExpression: { signatureKey: { $type: "string" } } });

export type VendorDoc = InferSchemaType<typeof vendorSchema>;
export const Vendor: Model<VendorDoc> = models.Vendor ?? model("Vendor", vendorSchema);
