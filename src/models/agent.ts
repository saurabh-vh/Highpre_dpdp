import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { AGENT_APP_KEYS, AGENT_DATA_TYPE_KEYS, AGENT_PLATFORM_KEYS, ALERT_OUTCOME_KEYS, ALERT_SOURCES } from "@/lib/agent/catalog";

/**
 * A desktop agent or browser extension install. Each personal download creates
 * one device with its own token (only the hash is stored), so a lost laptop
 * can be revoked alone. Company installs enrol themselves: they have no
 * HighPre user, only the computer's sign-in name.
 */
const agentDeviceSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    /** The member who downloaded it; absent for company installs. */
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    tokenHash: { type: String, required: true, unique: true },
    platform: { type: String, enum: AGENT_PLATFORM_KEYS, required: true },
    /** Enrolled from a company installer (Intune, Jamf and similar). */
    enrolled: { type: Boolean, default: false },
    /** Computer sign-in name, reported by company installs to tell people apart. */
    osUser: { type: String, maxlength: 64, default: "" },
    hostname: { type: String, maxlength: 64, default: "" },
    osVersion: { type: String, maxlength: 64, default: "" },
    agentVersion: { type: String, maxlength: 20, default: "" },
    firstSeenAt: { type: Date },
    lastSeenAt: { type: Date },
    revokedAt: { type: Date },
    /** Throttles alert emails to owners. */
    lastEmailAt: { type: Date },
  },
  { timestamps: true },
);

agentDeviceSchema.index({ orgId: 1, enrolled: 1, hostname: 1, osUser: 1 });

/**
 * One detection: a type of sensitive data was on the clipboard while a risky
 * app (an AI assistant, chat or paste site) was in front, or was pasted or
 * typed into one (browser extension). No content is stored.
 */
const agentAlertSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "AgentDevice", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    dataType: { type: String, enum: AGENT_DATA_TYPE_KEYS, required: true },
    app: { type: String, enum: AGENT_APP_KEYS, required: true },
    severity: { type: String, enum: ["high", "medium"], required: true },
    source: { type: String, enum: ALERT_SOURCES, default: "agent" },
    outcome: { type: String, enum: ALERT_OUTCOME_KEYS, default: "warned" },
    /** Repeats of the same type, app and outcome within 10 minutes are folded into one alert. */
    count: { type: Number, default: 1 },
    occurredAt: { type: Date, required: true },
    lastOccurredAt: { type: Date, required: true },
    /** The person said it was a false alarm (in the extension or the dashboard). */
    notSensitiveAt: { type: Date },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

agentAlertSchema.index({ orgId: 1, createdAt: -1 });
agentAlertSchema.index({ deviceId: 1, dataType: 1, app: 1, lastOccurredAt: -1 });

/**
 * What an organisation's agents watch for, sent to every device with its
 * heartbeat. Also holds the company-installer enrolment key version: keys are
 * derived (HMAC), so rotating means bumping the version.
 */
const agentPolicySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
    dataTypes: { type: [{ type: String, enum: AGENT_DATA_TYPE_KEYS }], default: () => [...AGENT_DATA_TYPE_KEYS] },
    /** Approved tools, such as a company ChatGPT workspace: no warnings there. */
    allowedApps: { type: [{ type: String, enum: AGENT_APP_KEYS }], default: [] },
    /** Browser extension: "warn" lets people continue after a warning; "block" doesn't. */
    extensionMode: { type: String, enum: ["warn", "block"], default: "warn" },
    enrollmentEnabled: { type: Boolean, default: false },
    enrollKeyVersion: { type: Number, default: 1 },
    enrollKeyRotatedAt: { type: Date },
  },
  { timestamps: true },
);

export type AgentDeviceDoc = InferSchemaType<typeof agentDeviceSchema>;
export type AgentAlertDoc = InferSchemaType<typeof agentAlertSchema>;
export type AgentPolicyDoc = InferSchemaType<typeof agentPolicySchema>;
export const AgentDevice: Model<AgentDeviceDoc> = models.AgentDevice ?? model("AgentDevice", agentDeviceSchema);
export const AgentAlert: Model<AgentAlertDoc> = models.AgentAlert ?? model("AgentAlert", agentAlertSchema);
export const AgentPolicy: Model<AgentPolicyDoc> = models.AgentPolicy ?? model("AgentPolicy", agentPolicySchema);
