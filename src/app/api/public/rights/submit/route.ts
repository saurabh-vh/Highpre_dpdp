import { connectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { json, limitOrNull } from "@/lib/http";
import { sendMail } from "@/lib/mail/mailer";
import { newRequestAlertEmail, requestReceivedEmail } from "@/lib/mail/templates";
import { referenceCode } from "@/lib/crypto";
import { verifyOtp } from "@/lib/otp";
import { addDays } from "@/lib/utils";
import { rightsSubmitSchema } from "@/lib/validation";
import { Organization, RightsRequest, Site, User } from "@/models";

/** Verifies the email code and files the request with the business. */
export async function POST(req: Request) {
  const limited = await limitOrNull(req, "rights", 10, 10 * 60_000);
  if (limited) return limited;

  const parsed = rightsSubmitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Check the form and try again.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const input = parsed.data;

  await connectDb();
  const check = await verifyOtp("rights", input.siteKey, input.email, input.code);
  if (check === "expired") return json({ error: "That code has expired. Request a new one." }, { status: 400 });
  if (check === "wrong") return json({ error: "That code isn't right.", fieldErrors: { code: ["That code isn't right."] } }, { status: 400 });

  const site = await Site.findOne({ siteKey: input.siteKey }).select("orgId name").lean();
  if (!site) return json({ error: "This request page no longer exists." }, { status: 404 });
  const org = await Organization.findById(site.orgId).lean();
  if (!org) return json({ error: "This request page no longer exists." }, { status: 404 });

  const now = new Date();
  const dueAt = addDays(now, org.responseDays);
  const request = await RightsRequest.create({
    orgId: org._id,
    siteId: site._id,
    reference: referenceCode(),
    type: input.type,
    name: input.name,
    email: input.email,
    phone: input.phone,
    details: input.details,
    language: input.language,
    emailVerifiedAt: now,
    dueAt,
    activity: [{ kind: "system", text: "Request submitted. Email address verified with a one-time code.", at: now }],
  });

  // Notify the requester and the business. Failures here shouldn't lose the request.
  const businessName = org.legalName || org.name;
  const admins = await User.find({ _id: { $in: org.members.filter((m) => m.role !== "member").map((m) => m.userId) } }).select("email").lean();
  const recipients = new Set([...admins.map((a) => a.email), ...(org.grievanceEmail ? [org.grievanceEmail] : [])]);
  const url = `${env().APP_URL}/dashboard/requests/${request._id}`;
  await Promise.allSettled([
    sendMail(requestReceivedEmail({ to: input.email, name: input.name, reference: request.reference, type: input.type, businessName, dueAt })),
    ...[...recipients].map((to) => sendMail(newRequestAlertEmail({ to, reference: request.reference, type: input.type, siteName: site.name, url, dueAt }))),
  ]);

  return json({ ok: true, reference: request.reference, dueAt });
}
