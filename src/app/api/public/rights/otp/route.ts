import { connectDb } from "@/lib/db";
import { json, limitOrNull } from "@/lib/http";
import { sendMail } from "@/lib/mail/mailer";
import { otpEmail } from "@/lib/mail/templates";
import { issueOtp } from "@/lib/otp";
import { otpRequestSchema } from "@/lib/validation";
import { Organization, Site } from "@/models";

/** Emails a 6-digit code so the requester (or a parent) proves they own the address. */
export async function POST(req: Request) {
  const limited = await limitOrNull(req, "otp", 5, 10 * 60_000);
  if (limited) return limited;

  const parsed = otpRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Enter a valid email address." }, { status: 422 });
  const { siteKey, email, purpose } = parsed.data;

  await connectDb();
  const site = await Site.findOne({ siteKey }).select("orgId children").lean();
  if (!site) return json({ error: "This page no longer exists." }, { status: 404 });
  if (purpose === "parental" && !site.children?.enabled) return json({ error: "This website doesn't collect parental consent." }, { status: 404 });
  const org = await Organization.findById(site.orgId).select("name legalName").lean();

  const code = await issueOtp(purpose, siteKey, email);
  if (!code) return json({ error: "We've sent several codes already. Check your inbox or try again in 10 minutes." }, { status: 429 });
  await sendMail(otpEmail(email, code, org?.legalName || org?.name || "the business", purpose));

  return json({ ok: true });
}
