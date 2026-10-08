import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { PLAN_IDS } from "@/lib/billing/plans";
import { DEFAULT_RESPONSE_DAYS } from "@/lib/constants";

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

const memberSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, default: "member" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

/** Razorpay subscription state, updated by checkout verification and webhooks. */
const billingSchema = new Schema(
  {
    status: { type: String, default: "none" },
    subscriptionId: { type: String },
    razorpayPlanId: { type: String },
    /** Subscription created for a checkout that hasn't completed yet; promoted once paid. */
    pendingSubscriptionId: { type: String },
    pendingPlan: { type: String, enum: PLAN_IDS },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    updatedAt: { type: Date },
  },
  { _id: false },
);

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    members: { type: [memberSchema], default: [] },
    // Shown in every privacy notice and used as the grievance contact.
    legalName: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    grievanceOfficerName: { type: String, trim: true, default: "" },
    grievanceEmail: { type: String, trim: true, lowercase: true, default: "" },
    grievancePhone: { type: String, trim: true, default: "" },
    responseDays: { type: Number, min: 1, max: 90, default: DEFAULT_RESPONSE_DAYS },
    plan: { type: String, enum: PLAN_IDS, default: "free" },
    billing: { type: billingSchema, default: () => ({}) },
    /** Owners and admins must use two-factor sign-in to work in this organisation. */
    requireTwoFactor: { type: Boolean, default: false },
  },
  { timestamps: true },
);

organizationSchema.index({ "members.userId": 1 });
organizationSchema.index({ "billing.subscriptionId": 1 }, { sparse: true });
organizationSchema.index({ "billing.pendingSubscriptionId": 1 }, { sparse: true });

export type OrganizationDoc = InferSchemaType<typeof organizationSchema>;
export const Organization: Model<OrganizationDoc> =
  models.Organization ?? model("Organization", organizationSchema);
