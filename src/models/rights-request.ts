import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { REQUEST_STATUS_VALUES, REQUEST_TYPE_VALUES } from "@/lib/constants";
import { LANG_CODES } from "@/lib/i18n/languages";

const activitySchema = new Schema(
  {
    kind: { type: String, enum: ["note", "status", "system"], required: true },
    text: { type: String, required: true, maxlength: 2000 },
    byUserId: { type: Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const rightsRequestSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    siteId: { type: Schema.Types.ObjectId, ref: "Site", required: true },
    reference: { type: String, required: true, unique: true },
    type: { type: String, enum: REQUEST_TYPE_VALUES, required: true },
    status: { type: String, enum: REQUEST_STATUS_VALUES, default: "open" },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true, default: "" },
    details: { type: String, trim: true, maxlength: 3000, default: "" },
    language: { type: String, enum: LANG_CODES, default: "en" },
    /** Last deadline reminder sent to the team: "soon" or "overdue". */
    reminderSent: { type: String, enum: ["soon", "overdue"] },
    emailVerifiedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    resolvedAt: { type: Date },
    activity: { type: [activitySchema], default: [] },
  },
  { timestamps: true },
);

rightsRequestSchema.index({ orgId: 1, status: 1, dueAt: 1 });

export type RightsRequestDoc = InferSchemaType<typeof rightsRequestSchema>;
export const RightsRequest: Model<RightsRequestDoc> =
  models.RightsRequest ?? model("RightsRequest", rightsRequestSchema);
