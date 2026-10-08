import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

/**
 * Who did what in an organisation: settings, notices, team, billing and
 * deletions. Append-only, shown under Activity and in the evidence pack.
 */
const auditLogSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    /** Snapshot so the log stays readable after a member leaves. */
    actorName: { type: String, default: "HighPre" },
    action: { type: String, required: true },
    summary: { type: String, required: true, maxlength: 300 },
    siteId: { type: Schema.Types.ObjectId, ref: "Site" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ orgId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLog: Model<AuditLogDoc> = models.AuditLog ?? model("AuditLog", auditLogSchema);
