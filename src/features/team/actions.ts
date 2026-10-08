"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth, requireAuthWithoutPolicy } from "@/lib/auth/guards";
import { ROLE_LABELS, can } from "@/lib/auth/permissions";
import { hashPassword } from "@/lib/auth/password";
import { createSession, readSession } from "@/lib/auth/session";
import { getUsage, seatLimitReached } from "@/lib/billing/usage";
import { randomToken, sha256 } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/mailer";
import { inviteEmail } from "@/lib/mail/templates";
import { acceptInviteSchema, inviteSchema, memberRoleSchema } from "@/lib/validation";
import { Invite, Organization, User } from "@/models";

const INVITE_DAYS = 7;

async function sendInvite(opts: { orgId: Types.ObjectId; orgName: string; email: string; role: "admin" | "member"; inviter: { id: string; name: string } }) {
  const token = randomToken(32);
  await Invite.deleteMany({ orgId: opts.orgId, email: opts.email });
  await Invite.create({
    orgId: opts.orgId,
    email: opts.email,
    role: opts.role,
    tokenHash: sha256(token),
    invitedBy: opts.inviter.id,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
  });
  await sendMail(
    inviteEmail({
      to: opts.email,
      orgName: opts.orgName,
      inviterName: opts.inviter.name,
      role: ROLE_LABELS[opts.role].toLowerCase(),
      url: `${env().APP_URL}/invite/${token}`,
    }),
  );
}

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role, plan } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const { email, role: inviteRole } = parsed.data;

  const existing = await User.findOne({ email }).select("_id").lean();
  if (existing && org.members.some((m) => String(m.userId) === String(existing._id))) {
    return { ok: false, fieldErrors: { email: ["This person is already on your team."] } };
  }
  const alreadyInvited = await Invite.exists({ orgId: org._id, email, expiresAt: { $gt: new Date() } });
  if (!alreadyInvited) {
    const limit = seatLimitReached(plan, (await getUsage(org)).seats);
    if (limit) return fail(limit);
  }

  await sendInvite({ orgId: org._id, orgName: org.name, email, role: inviteRole, inviter: user });
  await audit(org._id, user, "team.invited", `Invited ${email} as ${ROLE_LABELS[inviteRole].toLowerCase()}`);
  revalidatePath("/dashboard/team");
  return succeed(`Invitation sent to ${email}. It's valid for ${INVITE_DAYS} days.`);
}

export async function resendInviteAction(inviteId: string): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  if (!Types.ObjectId.isValid(inviteId)) return fail("Invitation not found.");
  const invite = await Invite.findOne({ _id: inviteId, orgId: org._id }).lean();
  if (!invite) return fail("Invitation not found.");
  await sendInvite({ orgId: org._id, orgName: org.name, email: invite.email, role: invite.role as "admin" | "member", inviter: user });
  revalidatePath("/dashboard/team");
  return succeed(`Sent again to ${invite.email}.`);
}

export async function revokeInviteAction(inviteId: string): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  if (!Types.ObjectId.isValid(inviteId)) return fail("Invitation not found.");
  const invite = await Invite.findOneAndDelete({ _id: inviteId, orgId: org._id }).lean();
  if (invite) await audit(org._id, user, "team.invite_revoked", `Revoked the invitation for ${invite.email}`);
  revalidatePath("/dashboard/team");
  return succeed("Invitation revoked.");
}

export async function changeRoleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return fail(denied("team"));
  const parsed = memberRoleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("Choose a valid role.");
  const { userId, role: newRole } = parsed.data;

  const member = org.members.find((m) => String(m.userId) === userId);
  if (!member) return fail("That person isn't on your team.");
  if (member.role === newRole) return succeed();
  // Only owners can create or remove owners.
  if ((newRole === "owner" || member.role === "owner") && role !== "owner") return fail("Only an owner can change who is an owner.");
  if (member.role === "owner" && org.members.filter((m) => m.role === "owner").length === 1) {
    return fail("Your team needs at least one owner. Make someone else an owner first.");
  }

  await Organization.updateOne({ _id: org._id, "members.userId": member.userId }, { $set: { "members.$.role": newRole } });
  const target = await User.findById(userId).select("name").lean();
  await audit(org._id, user, "team.role_changed", `Changed ${target?.name ?? "a member"}'s role to ${ROLE_LABELS[newRole].toLowerCase()}`);
  revalidatePath("/dashboard/team");
  return succeed("Role updated.");
}

export async function removeMemberAction(userId: string): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  const leaving = userId === user.id;
  if (!leaving && !can(role, "team")) return fail(denied("team"));
  const member = org.members.find((m) => String(m.userId) === userId);
  if (!member) return fail("That person isn't on your team.");
  if (member.role === "owner" && role !== "owner") return fail("Only an owner can remove an owner.");
  if (member.role === "owner" && org.members.filter((m) => m.role === "owner").length === 1) {
    return fail("Your team needs at least one owner. Make someone else an owner first.");
  }

  await Organization.updateOne({ _id: org._id }, { $pull: { members: { userId: member.userId } } });
  const target = await User.findById(userId).select("name").lean();
  await audit(org._id, user, leaving ? "team.left" : "team.removed", leaving ? `${user.name} left the team` : `Removed ${target?.name ?? "a member"} from the team`);
  if (leaving) {
    const next = await Organization.findOne({ "members.userId": user.id }).sort({ createdAt: 1 }).select("_id").lean();
    if (!next) redirect("/auth/clear");
    const session = await readSession();
    await createSession({ uid: user.id, oid: String(next._id), sv: session?.sv ?? 0 });
    redirect("/dashboard");
  }
  revalidatePath("/dashboard/team");
  return succeed("Removed from the team.");
}

/** Switches the active organisation for someone who belongs to several. */
export async function switchOrgAction(orgId: string): Promise<void> {
  // Switching is allowed while another organisation's 2FA policy is pending.
  const { user } = await requireAuthWithoutPolicy();
  if (!Types.ObjectId.isValid(orgId)) return;
  const target = await Organization.exists({ _id: orgId, "members.userId": user.id });
  if (!target) return;
  const session = await readSession();
  await createSession({ uid: user.id, oid: orgId, sv: session?.sv ?? 0 });
  redirect("/dashboard");
}

async function loadInvite(token: string) {
  await connectDb();
  return Invite.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
}

async function join(invite: { _id: unknown; orgId: Types.ObjectId; role: string; email: string }, u: { id: string; name: string; sv: number }) {
  await Organization.updateOne(
    { _id: invite.orgId, "members.userId": { $ne: new Types.ObjectId(u.id) } },
    { $push: { members: { userId: u.id, role: invite.role, joinedAt: new Date() } } },
  );
  await Invite.deleteOne({ _id: invite._id });
  await audit(invite.orgId, u, "team.joined", `${u.name} joined the team`);
  await createSession({ uid: u.id, oid: String(invite.orgId), sv: u.sv });
}

/** Accepts an invitation as the signed-in user, whose email must match it. */
export async function acceptInviteAction(token: string): Promise<ActionState> {
  const session = await readSession();
  if (!session) return fail("Log in first.");
  const invite = await loadInvite(token);
  if (!invite) return fail("This invitation has expired or was revoked. Ask for a new one.");
  const user = await User.findById(session.uid).lean();
  if (!user || user.email !== invite.email) return fail(`This invitation is for ${invite.email}. Log in with that email to accept it.`);
  await join(invite, { id: String(user._id), name: user.name, sv: user.sessionVersion ?? 0 });
  redirect("/dashboard");
}

/** Accepts an invitation by creating an account for the invited email. */
export async function acceptInviteWithSignupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = acceptInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const invite = await loadInvite(parsed.data.token);
  if (!invite) return fail("This invitation has expired or was revoked. Ask for a new one.");
  if (await User.exists({ email: invite.email })) return fail("An account with this email already exists. Log in to accept.");

  const user = await User.create({ name: parsed.data.name, email: invite.email, passwordHash: await hashPassword(parsed.data.password) });
  await join(invite, { id: String(user._id), name: user.name, sv: 0 });
  redirect("/dashboard");
}
