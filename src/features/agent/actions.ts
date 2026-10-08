"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fail, succeed, type ActionState } from "@/lib/action-state";
import { AGENT_APP_KEYS, AGENT_DATA_TYPE_KEYS } from "@/lib/agent/catalog";
import { audit } from "@/lib/audit";
import { denied, requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { AgentAlert, AgentDevice, AgentPolicy } from "@/models";

/** Removes a device: its token stops working and the agent turns itself off on next contact. */
export async function revokeDeviceAction(deviceId: string): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!Types.ObjectId.isValid(deviceId)) return fail("Device not found.");
  const device = await AgentDevice.findOne({ _id: deviceId, orgId: org._id, revokedAt: { $exists: false } }).lean();
  if (!device) return fail("Device not found.");
  const own = device.userId && String(device.userId) === user.id;
  if (!own && !can(role, "team")) return fail(denied("team"));
  await AgentDevice.updateOne({ _id: device._id }, { revokedAt: new Date() });
  await audit(org._id, user, "agent.revoked", `Removed HighPre from ${device.hostname || "a device that never connected"}`);
  revalidatePath("/dashboard/agent");
  return succeed("Device removed. It turns itself off the next time it checks in.");
}

export async function acknowledgeAlertsAction(alertIds: string[] | "all"): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  const filter =
    alertIds === "all"
      ? { orgId: org._id, acknowledgedAt: { $exists: false } }
      : { orgId: org._id, _id: { $in: alertIds.filter((id) => Types.ObjectId.isValid(id)) } };
  const { modifiedCount } = await AgentAlert.updateMany(filter, { acknowledgedAt: new Date(), acknowledgedBy: user.id });
  revalidatePath("/dashboard", "layout");
  return succeed(modifiedCount === 1 ? "Alert marked as reviewed." : `${modifiedCount} alerts marked as reviewed.`);
}

/** The person an alert is about says it was a false alarm. Owners still see it, marked as such. */
export async function markNotSensitiveAction(alertId: string): Promise<ActionState> {
  const { org, user } = await requireAuth();
  if (!Types.ObjectId.isValid(alertId)) return fail("Alert not found.");
  const { modifiedCount } = await AgentAlert.updateOne(
    { _id: alertId, orgId: org._id, userId: user.id, notSensitiveAt: { $exists: false } },
    { notSensitiveAt: new Date() },
  );
  if (!modifiedCount) return fail("Alert not found.");
  revalidatePath("/dashboard/agent");
  return succeed("Thanks. Your owners will see this was a false alarm.");
}

const policySchema = z.object({
  dataTypes: z.array(z.enum(AGENT_DATA_TYPE_KEYS)).min(1, "Choose at least one kind of data to watch for."),
  allowedApps: z.array(z.enum(AGENT_APP_KEYS)),
  extensionMode: z.enum(["warn", "block"]),
});

/** What every agent and extension in the organisation watches for. Devices pick it up at their next check-in. */
export async function saveAgentPolicyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  const parsed = policySchema.safeParse({
    dataTypes: formData.getAll("dataTypes"),
    allowedApps: formData.getAll("allowedApps"),
    extensionMode: formData.get("extensionMode"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the settings.");
  await AgentPolicy.updateOne({ orgId: org._id }, { $set: parsed.data }, { upsert: true, setDefaultsOnInsert: true });
  const approved = parsed.data.allowedApps.length ? `, ${parsed.data.allowedApps.length} approved app(s)` : "";
  await audit(org._id, user, "agent.policy", `Updated agent settings: ${parsed.data.dataTypes.length} kinds of data watched${approved}, extension set to ${parsed.data.extensionMode}`);
  revalidatePath("/dashboard/agent");
  return succeed("Saved. Computers and browsers pick this up within 15 minutes.");
}

/** Turns company installs on or off. Off stops new computers joining; enrolled ones keep working. */
export async function setEnrollmentAction(enabled: boolean): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  await AgentPolicy.updateOne({ orgId: org._id }, { $set: { enrollmentEnabled: enabled } }, { upsert: true, setDefaultsOnInsert: true });
  await audit(org._id, user, "agent.enrollment", enabled ? "Turned on company installs" : "Turned off company installs");
  revalidatePath("/dashboard/agent");
  return succeed(enabled ? "Company installs are on." : "Company installs are off. Computers already set up keep working.");
}

/** Retires the current company installer. Computers already enrolled keep working; removed ones may enrol again. */
export async function rotateEnrollKeyAction(): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  await AgentPolicy.updateOne(
    { orgId: org._id },
    { $inc: { enrollKeyVersion: 1 }, $set: { enrollKeyRotatedAt: new Date() } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await audit(org._id, user, "agent.enroll_key_rotated", "Replaced the company installer key");
  revalidatePath("/dashboard/agent");
  return succeed("Key replaced. Download the company installer again and redeploy it; the old one no longer works.");
}
