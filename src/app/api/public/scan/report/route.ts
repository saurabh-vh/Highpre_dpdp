import { sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { clientIp, hashIp, json, limitOrNull } from "@/lib/http";
import { log } from "@/lib/log";
import { sendMail } from "@/lib/mail/mailer";
import { scanReportEmail } from "@/lib/mail/templates";
import { marketingConsentRecord, scanLeadSchema } from "@/lib/public-scan/lead";
import { buildScanReportPdf } from "@/lib/public-scan/pdf";
import { findPublicReport } from "@/lib/public-scan/store";
import { rateLimit } from "@/lib/rate-limit";
import { ScanLead } from "@/models";

/**
 * "Email me the PDF report" for a free public scan. Works only from a stored
 * report (no new fetching), is rate-limited per IP and per email address, and
 * records the separate product-updates choice with the lead.
 */
export async function POST(req: Request) {
  const limited = await limitOrNull(req, "scan-report", 5, 60 * 60_000);
  if (limited) return limited;

  const parsed = scanLeadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return json({ error: fieldErrors.email?.[0] ?? fieldErrors.reportId?.[0] ?? "Check your email address." }, { status: 422 });
  }
  const { reportId, email, marketing } = parsed.data;

  // Keyed by a hash so email addresses never sit in the rate-limit collection.
  const perEmail = await rateLimit(`scan-report-email:${sha256(email)}`, 3, 24 * 60 * 60_000);
  if (!perEmail.allowed) {
    return json({ error: "We've already sent a few reports to this address today. Try again tomorrow." }, { status: 429, headers: { "Retry-After": String(perEmail.retryAfter) } });
  }

  const report = await findPublicReport(reportId);
  if (!report) return json({ error: "This report has expired. Run the scan again to get a new one." }, { status: 404 });

  const { APP_URL } = env();
  const reportUrl = `${APP_URL}/scan/r/${reportId}`;
  const site = new URL(report.url).hostname;

  try {
    const pdf = await buildScanReportPdf({ ...report, appUrl: APP_URL, reportUrl });
    await sendMail(
      scanReportEmail({ to: email, site, score: report.score, reportUrl, signupUrl: `${APP_URL}/register`, pdf, filename: `highpre-scan-${site.replace(/[^a-z0-9.-]/gi, "")}.pdf` }),
    );
  } catch (error) {
    log.error("public_scan.report_email_failed", { reportId, error: String(error) });
    return json({ error: "We couldn't send the report just now. Try again in a minute." }, { status: 502 });
  }

  await ScanLead.create({
    email,
    url: report.url,
    score: report.score,
    reportId,
    marketingConsent: marketingConsentRecord(marketing),
    ipHash: hashIp(clientIp(req)),
  });

  return json({ ok: true });
}
