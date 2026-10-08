import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { Types } from "mongoose";
import { effectivePlan } from "@/lib/billing/plans";
import { connectDb } from "@/lib/db";
import { Organization, Site, User } from "@/models";
import { can, type Permission } from "./permissions";
import { readSession } from "./session";

/**
 * Resolves the signed-in user and their active organisation, or redirects to
 * /login. Sessions issued before a password change (older sessionVersion) are
 * rejected. Wrapped in React `cache` so layouts and pages share one lookup.
 *
 * Doesn't apply the organisation's two-factor policy: use it only where an
 * owner or admin who still has to turn on 2FA must get through (the dashboard
 * frame, the Account page, 2FA setup, switching organisation). Everything
 * else uses `requireAuth`.
 */
export const requireAuthWithoutPolicy = cache(async () => {
  const session = await readSession();
  if (!session) redirect("/auth/clear");

  await connectDb();
  const [user, org] = await Promise.all([
    User.findById(session.uid).lean(),
    Organization.findOne({ _id: session.oid, "members.userId": session.uid }).lean(),
  ]);
  if (!user || !org || (user.sessionVersion ?? 0) !== session.sv) redirect("/auth/clear");

  const role = org.members.find((m) => String(m.userId) === session.uid)?.role ?? "member";
  return {
    user: { id: String(user._id), name: user.name, email: user.email, twoFactorEnabled: Boolean(user.twoFactorEnabled) },
    org: { ...org, id: String(org._id) },
    role,
    plan: effectivePlan(org),
    /** The organisation requires 2FA for owners/admins and this one hasn't turned it on. */
    mustEnableTwoFactor: Boolean(org.requireTwoFactor) && (role === "owner" || role === "admin") && !user.twoFactorEnabled,
  };
});

/** `requireAuthWithoutPolicy`, plus: owners/admins the org requires 2FA from are sent to set it up. */
export const requireAuth = cache(async () => {
  const ctx = await requireAuthWithoutPolicy();
  if (ctx.mustEnableTwoFactor) redirect("/dashboard/account?2fa=required");
  return ctx;
});

export type AuthContext = Awaited<ReturnType<typeof requireAuth>>;

/** Pages for areas the role can't use return 404 rather than a broken form. */
export async function requirePagePermission(permission: Permission): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!can(ctx.role, permission)) notFound();
  return ctx;
}

/** Message for server actions refused by role: `if (!can(role, p)) return fail(denied(p))`. */
export function denied(permission: Permission): string {
  if (permission === "billing") return "Only the account owner can manage billing.";
  return "Your role doesn't allow this. Ask an owner or admin.";
}

/** Loads a site, guaranteeing it belongs to the signed-in organisation. */
export async function requireSite(siteId: string) {
  const { org } = await requireAuth();
  if (!Types.ObjectId.isValid(siteId)) notFound();
  const site = await Site.findOne({ _id: siteId, orgId: org._id }).lean();
  if (!site) notFound();
  return { ...site, id: String(site._id) };
}
