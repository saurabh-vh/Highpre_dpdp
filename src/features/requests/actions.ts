"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { fail, fromZodError, succeed, type ActionState } from "@/lib/action-state";
import { audit } from "@/lib/audit";
import { denied, requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { requestStatusLabel } from "@/lib/constants";
import { requestUpdateSchema } from "@/lib/validation";
import { RightsRequest } from "@/models";

export async function updateRequestAction(requestId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { org, user, role } = await requireAuth();
  if (!can(role, "requests")) return fail(denied("requests"));
  if (!Types.ObjectId.isValid(requestId)) return fail("Request not found.");
  const parsed = requestUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fromZodError(parsed.error);

  const request = await RightsRequest.findOne({ _id: requestId, orgId: org._id });
  if (!request) return fail("Request not found.");

  const { status, note } = parsed.data;
  if (status === request.status && !note) return fail("Change the status or add a note.");

  if (status !== request.status) {
    request.activity.push({ kind: "status", text: `Status changed to ${requestStatusLabel(status)}`, byUserId: user.id, at: new Date() });
    request.status = status;
    request.resolvedAt = status === "resolved" || status === "rejected" ? new Date() : undefined;
  }
  if (note) request.activity.push({ kind: "note", text: note, byUserId: user.id, at: new Date() });

  await request.save();
  await audit(org._id, user, "request.updated", `Updated data request ${request.reference}: ${requestStatusLabel(request.status)}${note ? ", added a note" : ""}`);
  revalidatePath(`/dashboard/requests/${requestId}`);
  revalidatePath("/dashboard", "layout");
  return succeed("Request updated.");
}
