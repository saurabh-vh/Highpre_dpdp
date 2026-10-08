import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** One-time codes that verify the email of someone filing a rights request or giving parental consent. */
const otpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    siteKey: { type: String, required: true },
    purpose: { type: String, enum: ["rights", "parental"], default: "rights" },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB deletes expired codes automatically.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ email: 1, siteKey: 1, purpose: 1, createdAt: -1 });

export type OtpDoc = InferSchemaType<typeof otpSchema>;
export const Otp: Model<OtpDoc> = models.Otp ?? model("Otp", otpSchema);
