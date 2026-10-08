"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/format";
import { vendorSchema } from "@/lib/validation";
import { dpaStatusLabel } from "@/lib/vendors/constants";
import { syncVendorsFromLatestScans } from "@/lib/vendors/sync";
import { Vendor } from "@/models";

function revalidate() {
  revalidatePath("/dashboard/vendors");
  revalidatePath("/dashboard");
}

/** Creates a vendor (empty `vendorId`) or updates one, including its DPA status and dates. */
export async function saveVendorAction(vendorId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "settings")) return fail(denied("settings"));
  const parsed = vendorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);
  const v = parsed.data;
  // Cleared dates are unset rather than stored as null.
  const { dpaSignedAt, dpaRenewalAt, ...fields } = v;
  const dates = { dpaSignedAt, dpaRenewalAt };
  const set = { ...fields, ...Object.fromEntries(Object.entries(dates).filter(([, d]) => d)) };
  const unset = Object.fromEntries(Object.entries(dates).filter(([, d]) => !d).map(([k]) => [k, 1]));

  if (!vendorId) {
    const vendor = await Vendor.create({ ...set, orgId: org._id, source: "manual" });
    await audit(org._id, user, "vendor.added", `Added the vendor ${vendor.name} (DPA: ${dpaStatusLabel(v.dpaStatus).toLowerCase()})`);
    revalidate();
    return succeed(`${vendor.name} added.`);
  }

  if (!Types.ObjectId.isValid(vendorId)) return fail("Vendor not found.");
  const before = await Vendor.findOneAndUpdate({ _id: vendorId, orgId: org._id }, { $set: set, $unset: unset }).lean();
  if (!before) return fail("Vendor not found.");
  const changes = [
    before.dpaStatus !== v.dpaStatus && `DPA ${dpaStatusLabel(before.dpaStatus).toLowerCase()} → ${dpaStatusLabel(v.dpaStatus).toLowerCase()}`,
    v.dpaRenewalAt && before.dpaRenewalAt?.getTime() !== v.dpaRenewalAt.getTime() && `renewal ${formatDate(v.dpaRenewalAt)}`,
  ].filter(Boolean);
  await audit(org._id, user, "vendor.updated", `Updated the vendor ${v.name}${changes.length ? `: ${changes.join(", ")}` : ""}`);
  revalidate();
  return succeed("Vendor saved.");
}

/** Archives a vendor you no longer use, or restores it. */
export async function archiveVendorAction(vendorId: string, archive: boolean): Promise<void> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "settings") || !Types.ObjectId.isValid(vendorId)) return;
  const vendor = await Vendor.findOneAndUpdate({ _id: vendorId, orgId: org._id }, archive ? { archivedAt: new Date() } : { $unset: { archivedAt: 1 } }).lean();
  if (!vendor) return;
  await audit(org._id, user, archive ? "vendor.archived" : "vendor.restored", `${archive ? "Archived" : "Restored"} the vendor ${vendor.name}`);
  revalidate();
}

/** Adds vendors found by each website's latest scan (scans add them automatically from now on). */
export async function syncVendorsAction(): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "content.edit")) return fail(denied("content.edit"));
  const result = await syncVendorsFromLatestScans(org._id);
  if (result.sites === 0) return fail("No completed scans yet. Scan a website first.");
  if (result.created > 0) await audit(org._id, user, "vendors.synced", `Added ${result.created} vendor${result.created > 1 ? "s" : ""} from the latest website scans`);
  revalidate();
  return succeed(result.created ? `Added ${result.created} new vendor${result.created > 1 ? "s" : ""}.` : "Up to date. No new vendors found.");
}
