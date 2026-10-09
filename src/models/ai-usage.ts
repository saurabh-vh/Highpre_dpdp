import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { AGENT_APP_KEYS } from "@/lib/agent/catalog";

/**
 * "This computer opened this AI tool on this day." That's all: no times,
 * durations, pages or chats. Owners only ever see company totals (how many
 * people used each tool), never a person's own record.
 */
const aiUsageSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "AgentDevice", required: true },
    /** The member who downloaded the device, so their laptop and browser count as one person. */
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    /** The device's local date, YYYY-MM-DD. */
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    app: { type: String, enum: AGENT_APP_KEYS, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

aiUsageSchema.index({ deviceId: 1, day: 1, app: 1 }, { unique: true });
aiUsageSchema.index({ orgId: 1, day: 1 });

export type AiUsageDoc = InferSchemaType<typeof aiUsageSchema>;
export const AiUsage: Model<AiUsageDoc> = models.AiUsage ?? model("AiUsage", aiUsageSchema);
