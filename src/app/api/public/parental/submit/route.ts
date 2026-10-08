import { appendConsent } from "@/lib/consent/record";
import { connectDb } from "@/lib/db";
import { clientIp, hashIp, json, limitOrNull } from "@/lib/http";
import { isTracking } from "@/lib/constants";
import { getLocale, purposeText } from "@/lib/i18n";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/mailer";
import { parentalConfirmationEmail } from "@/lib/mail/templates";
import { verifyOtp } from "@/lib/otp";
import { parentalSubmitSchema } from "@/lib/validation";
import { Organization, ParentalConsent, Site } from "@/models";

/**
 * Records verifiable parental consent for a child visitor: the parent has
 * proved control of their email with a code and declared they're an adult
 * and the child's parent or lawful guardian. Tracking purposes are refused
 * whatever was submitted (DPDP s.9(3)).
 */
export async function POST(req: Request) {
  const limited = await limitOrNull(req, "parental", 10, 10 * 60_000);
  if (limited) return limited;

  const parsed = parentalSubmitSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Check the form and try again.", fieldErrors: parsed.error.flatten().fieldErrors }, { status: 422 });
  }
  const input = parsed.data;

  await connectDb();
  const site = await Site.findOne({ siteKey: input.siteKey }).select("orgId name purposes publishedNoticeVersion children").lean();
  if (!site || !site.children?.enabled || !site.publishedNoticeVersion) {
    return json({ error: "This website doesn't collect parental consent." }, { status: 404 });
  }

  const check = await verifyOtp("parental", input.siteKey, input.email, input.code);
  if (check === "expired") return json({ error: "That code has expired. Request a new one." }, { status: 400 });
  if (check === "wrong") return json({ error: "That code isn't right.", fieldErrors: { code: ["That code isn't right."] } }, { status: 400 });

  const chosen = new Set(input.purposes);
  const decisions = site.purposes.map((p) => ({
    purpose: p.key,
    granted: p.essential ? true : isTracking(p) ? false : chosen.has(p.key),
  }));
  const now = new Date();
  const userAgent = req.headers.get("user-agent")?.slice(0, 300);
  const ipHash = hashIp(clientIp(req));

  const consent = await ParentalConsent.create({
    siteId: site._id,
    orgId: site.orgId,
    principalId: input.principalId,
    parentName: input.parentName,
    parentEmail: input.email,
    relationship: input.relationship,
    childName: input.childName,
    decisions,
    noticeVersion: site.publishedNoticeVersion,
    language: input.language,
    declaration: getLocale(input.language).parental.declaration,
    emailVerifiedAt: now,
    ipHash,
    userAgent,
  });
  await appendConsent({
    siteId: site._id,
    principalId: input.principalId,
    action: "grant",
    noticeVersion: site.publishedNoticeVersion,
    decisions,
    language: input.language,
    ageGroup: "child",
    parentalConsentId: consent._id,
    ipHash,
    userAgent,
  });

  const org = await Organization.findById(site.orgId).select("name legalName").lean();
  const granted = site.purposes.filter((p) => !p.essential && decisions.find((d) => d.purpose === p.key)?.granted).map((p) => purposeText(p, "en").name);
  try {
    await sendMail(parentalConfirmationEmail({ to: input.email, parentName: input.parentName, businessName: org?.legalName || org?.name || site.name, purposes: granted }));
  } catch (error) {
    log.warn("parental.email_failed", { siteId: String(site._id), error: String(error) });
  }

  return json({ ok: true });
}
