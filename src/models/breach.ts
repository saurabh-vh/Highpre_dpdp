import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { BREACH_SEVERITIES, DATA_CATEGORY_VALUES } from "@/lib/constants";

const stepSchema = new Schema(
  {
    key: { type: String, required: true },
    doneAt: { type: Date },
    doneBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const breachSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    reference: { type: String, required: true, unique: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 5000, default: "" },
    severity: { type: String, enum: BREACH_SEVERITIES, default: "medium" },
    discoveredAt: { type: Date, required: true },
    reportDueAt: { type: Date, required: true },
    dataCategories: { type: [String], enum: DATA_CATEGORY_VALUES, default: [] },
    affectedCount: { type: Number, min: 0 },
    steps: { type: [stepSchema], default: [] },
    closedAt: { type: Date },
    /** Set once the "report due soon" reminder has been emailed. */
    reminderSentAt: { type: Date },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

export type BreachDoc = InferSchemaType<typeof breachSchema>;
export const Breach: Model<BreachDoc> = models.Breach ?? model("Breach", breachSchema);
