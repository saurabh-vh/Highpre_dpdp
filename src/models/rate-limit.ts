import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** Fixed-window counters shared by every app instance. Expired windows are removed by TTL. */
const rateLimitSchema = new Schema({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  resetAt: { type: Date, required: true },
});

rateLimitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 60 });

export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;
export const RateLimitBucket: Model<RateLimitDoc> = models.RateLimitBucket ?? model("RateLimitBucket", rateLimitSchema);
