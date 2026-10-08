import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/** A pending invitation to join an organisation. The token itself is only ever emailed. */
const inviteSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Expired invitations are removed automatically.
inviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
inviteSchema.index({ orgId: 1, email: 1 });

export type InviteDoc = InferSchemaType<typeof inviteSchema>;
export const Invite: Model<InviteDoc> = models.Invite ?? model("Invite", inviteSchema);
