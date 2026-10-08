"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, fromZodError, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { BREACH_CHECKLIST, BREACH_REPORT_HOURS } from "@/lib/constants";
import { referenceCode } from "@/lib/crypto";
import { addHours } from "@/lib/utils";
import { breachSchema } from "@/lib/validation";
import { Breach } from "@/models";

/** Converts a datetime-local value ("YYYY-MM-DDTHH:mm") to UTC using the browser's offset. */
function localToUtc(value: FormDataEntryValue | null, tzOffset: FormDataEntryValue | null): Date | undefined {
  const raw = typeof value === "string" ? value : "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return undefined;
  const offsetMinutes = Number(tzOffset) || 0;
  return new Date(Date.parse(`${raw}:00Z`) + offsetMinutes * 60_000);
}

export async function createBreachAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "breaches")) return fail(denied("breaches"));
  const parsed = breachSchema.safeParse({
    ...Object.fromEntries(formData),
    discoveredAt: localToUtc(formData.get("discoveredAt"), formData.get("tzOffset")),
    affectedCount: formData.get("affectedCount") || undefined,
    dataCategories: formData.getAll("dataCategories"),
  });
  if (!parsed.success) return fromZodError(parsed.error);
  if (parsed.data.discoveredAt > new Date()) return { ok: false, fieldErrors: { discoveredAt: ["This can't be in the future."] } };

  const breach = await Breach.create({
    ...parsed.data,
    orgId: org._id,
    reference: referenceCode("BR"),
    reportDueAt: addHours(parsed.data.discoveredAt, BREACH_REPORT_HOURS),
    steps: BREACH_CHECKLIST.map((s) => ({ key: s.key })),
    reportedBy: user.id,
  });
  await audit(org._id, user, "breach.logged", `Logged breach ${breach.reference}: ${breach.title}`);
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/breaches/${breach._id}`);
}

export async function toggleBreachStepAction(breachId: string, key: string): Promise<void> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "breaches") || !Types.ObjectId.isValid(breachId)) return;
  const breach = await Breach.findOne({ _id: breachId, orgId: org._id });
  if (!breach || breach.closedAt) return;
  const step = breach.steps.find((s) => s.key === key);
  if (!step) return;
  step.doneAt = step.doneAt ? undefined : new Date();
  step.doneBy = step.doneAt ? new Types.ObjectId(user.id) : undefined;
  await breach.save();
  await audit(org._id, user, "breach.step", `${step.doneAt ? "Completed" : "Reopened"} "${key.replace(/_/g, " ")}" on breach ${breach.reference}`);
  revalidatePath(`/dashboard/breaches/${breachId}`);
}

export async function closeBreachAction(breachId: string): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "breaches")) return fail(denied("breaches"));
  if (!Types.ObjectId.isValid(breachId)) return fail("Incident not found.");
  const breach = await Breach.findOne({ _id: breachId, orgId: org._id });
  if (!breach) return fail("Incident not found.");
  if (breach.steps.some((s) => !s.doneAt)) return fail("Complete every step before closing the incident.");
  breach.closedAt = new Date();
  await breach.save();
  await audit(org._id, user, "breach.closed", `Closed breach ${breach.reference}`);
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Incident closed." };
}
