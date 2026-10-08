import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    /** Bumped on password change or "log out everywhere"; sessions carrying an older value are rejected. */
    sessionVersion: { type: Number, default: 0 },
    lastLoginAt: { type: Date },
    /** Two-factor sign-in with an authenticator app (see lib/auth/totp.ts). */
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorEnabledAt: { type: Date },
    /** Authenticator secret, AES-256-GCM encrypted (lib/crypto.ts `encryptSecret`). */
    totpSecret: { type: String, select: false },
    /** Secret shown during setup, promoted to `totpSecret` once a code confirms it. */
    totpPendingSecret: { type: String, select: false },
    /** Last accepted time step; codes from this step or earlier are refused (no replay). */
    totpLastStep: { type: Number, select: false },
    /** SHA-256 hashes of unused recovery codes; each is removed when used. */
    recoveryCodeHashes: { type: [String], select: false },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: Schema.Types.ObjectId };
export const User: Model<InferSchemaType<typeof userSchema>> = models.User ?? model("User", userSchema);
