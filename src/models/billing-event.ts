import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Processed Razorpay webhook events. The unique id makes webhook handling idempotent. */
const billingEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: "Organization" },
    subscriptionId: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type BillingEventDoc = InferSchemaType<typeof billingEventSchema>;
export const BillingEvent: Model<BillingEventDoc> = models.BillingEvent ?? model("BillingEvent", billingEventSchema);
