import { ALERT_OUTCOMES, appLabel, dataTypeLabel } from "@/lib/agent/catalog";
import { requestTypeLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import type { Mail } from "./mailer";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Minimal monochrome email shell that renders consistently across clients. */
function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#000">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;padding:36px">
<tr><td style="font-size:22px;font-weight:700;letter-spacing:-0.5px;padding-bottom:20px">${escape(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#1c1c1e">${bodyHtml}</td></tr>
</table>
<p style="font-size:12px;color:#8e8e93;margin-top:16px">Sent by HighPre.</p>
</td></tr></table></body></html>`;
}

export function otpEmail(to: string, code: string, businessName: string, purpose: "rights" | "parental" = "rights"): Mail {
  const what = purpose === "parental" ? "give parental consent to" : "submit your data request to";
  return {
    to,
    subject: `${code} is your verification code`,
    text: `Your code to ${what} ${businessName} is ${code}. It expires in 10 minutes. If you didn't ask for this, ignore this email.`,
    html: layout(
      "Verify your email",
      `<p>Use this code to ${what} <strong>${escape(businessName)}</strong>.</p>
       <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
       <p style="color:#8e8e93">It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>`,
    ),
  };
}

export function requestReceivedEmail(opts: {
  to: string;
  name: string;
  reference: string;
  type: string;
  businessName: string;
  dueAt: Date;
}): Mail {
  const type = requestTypeLabel(opts.type).toLowerCase();
  return {
    to: opts.to,
    subject: `Request ${opts.reference} received`,
    text: `Hi ${opts.name}, ${opts.businessName} has received your request to ${type}. Reference: ${opts.reference}. They aim to respond by ${formatDate(opts.dueAt)}.`,
    html: layout(
      "We've received your request",
      `<p>Hi ${escape(opts.name)},</p>
       <p><strong>${escape(opts.businessName)}</strong> has received your request to ${escape(type)}.</p>
       <p>Reference: <strong>${opts.reference}</strong><br/>Expected response by: <strong>${formatDate(opts.dueAt)}</strong></p>
       <p style="color:#8e8e93">Keep this email for your records.</p>`,
    ),
  };
}

export function newRequestAlertEmail(opts: { to: string; reference: string; type: string; siteName: string; url: string; dueAt: Date }): Mail {
  return {
    to: opts.to,
    subject: `New data request ${opts.reference} — ${opts.siteName}`,
    text: `A new "${requestTypeLabel(opts.type)}" request arrived for ${opts.siteName}. Respond by ${formatDate(opts.dueAt)}: ${opts.url}`,
    html: layout(
      "New data request",
      `<p>A new <strong>${escape(requestTypeLabel(opts.type))}</strong> request arrived for ${escape(opts.siteName)}.</p>
       <p>Respond by <strong>${formatDate(opts.dueAt)}</strong>.</p>
       <p><a href="${opts.url}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Open request</a></p>`,
    ),
  };
}

export function passwordResetEmail(to: string, url: string): Mail {
  return {
    to,
    subject: "Reset your HighPre password",
    text: `Reset your password using this link (valid for 1 hour): ${url}`,
    html: layout(
      "Reset your password",
      `<p>Click below to choose a new password. The link is valid for 1 hour.</p>
       <p><a href="${url}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">Choose new password</a></p>
       <p style="color:#8e8e93">If you didn't request this, you can ignore this email.</p>`,
    ),
  };
}

const button = (url: string, label: string) =>
  `<p><a href="${url}" style="display:inline-block;background:#000;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none">${escape(label)}</a></p>`;

export function inviteEmail(opts: { to: string; orgName: string; inviterName: string; role: string; url: string }): Mail {
  return {
    to: opts.to,
    subject: `${opts.inviterName} invited you to ${opts.orgName} on HighPre`,
    text: `${opts.inviterName} invited you to join ${opts.orgName} on HighPre as ${opts.role}. Accept within 7 days: ${opts.url}`,
    html: layout(
      "You're invited",
      `<p><strong>${escape(opts.inviterName)}</strong> invited you to join <strong>${escape(opts.orgName)}</strong> on HighPre as ${escape(opts.role)}.</p>
       ${button(opts.url, "Accept invitation")}
       <p style="color:#8e8e93">The link is valid for 7 days. If you weren't expecting this, ignore this email.</p>`,
    ),
  };
}

export function requestReminderEmail(opts: { to: string; orgName: string; items: { reference: string; type: string; dueAt: Date; overdue: boolean }[]; url: string }): Mail {
  const overdue = opts.items.filter((i) => i.overdue).length;
  const lines = opts.items.map((i) => `${i.reference} · ${requestTypeLabel(i.type)} · ${i.overdue ? "overdue since" : "due"} ${formatDate(i.dueAt)}`);
  return {
    to: opts.to,
    subject: overdue > 0 ? `${overdue} data request${overdue > 1 ? "s are" : " is"} overdue — ${opts.orgName}` : `Data requests due soon — ${opts.orgName}`,
    text: `These data requests need a reply:\n${lines.join("\n")}\n\nOpen your inbox: ${opts.url}`,
    html: layout(
      overdue > 0 ? "Data requests are overdue" : "Data requests due soon",
      `<p>These requests for <strong>${escape(opts.orgName)}</strong> need a reply:</p>
       <ul style="padding-left:18px">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
       ${button(opts.url, "Open data requests")}`,
    ),
  };
}

export function breachReminderEmail(opts: { to: string; orgName: string; reference: string; title: string; reportDueAt: Date; url: string }): Mail {
  return {
    to: opts.to,
    subject: `Breach report due soon: ${opts.reference}`,
    text: `The detailed report for "${opts.title}" (${opts.reference}) is due to the Data Protection Board by ${formatDate(opts.reportDueAt)}. ${opts.url}`,
    html: layout(
      "Breach report due soon",
      `<p>The detailed report for <strong>${escape(opts.title)}</strong> (${opts.reference}) at ${escape(opts.orgName)} is due to the Data Protection Board within 24 hours.</p>
       ${button(opts.url, "Open incident")}`,
    ),
  };
}

export function dpaRenewalReminderEmail(opts: { to: string; orgName: string; url: string; items: { name: string; renewalAt: Date }[] }): Mail {
  const lines = opts.items.map((i) => `${i.name}: ${formatDate(i.renewalAt)}`);
  return {
    to: opts.to,
    subject: `Vendor agreement${opts.items.length > 1 ? "s" : ""} up for renewal at ${opts.orgName}`,
    text: `These data processing agreements are due for renewal within 14 days:\n${lines.join("\n")}\n${opts.url}`,
    html: layout(
      "Vendor agreements to renew",
      `<p>These data processing agreements at <strong>${escape(opts.orgName)}</strong> are due for renewal within 14 days:</p>
       <ul>${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
       ${button(opts.url, "Open vendors")}`,
    ),
  };
}

export function parentalConfirmationEmail(opts: { to: string; parentName: string; businessName: string; purposes: string[] }): Mail {
  const list = opts.purposes.length ? opts.purposes.join(", ") : "essential website features only";
  return {
    to: opts.to,
    subject: `Parental consent recorded for ${opts.businessName}`,
    text: `Hi ${opts.parentName}, your consent for your child's use of ${opts.businessName} has been recorded. Allowed: ${list}. You can withdraw it at any time through the business's data request page.`,
    html: layout(
      "Consent recorded",
      `<p>Hi ${escape(opts.parentName)},</p>
       <p>Your consent for your child's use of <strong>${escape(opts.businessName)}</strong> has been recorded.</p>
       <p>Allowed: <strong>${escape(list)}</strong></p>
       <p style="color:#8e8e93">You can withdraw it at any time through the business's data request page. If you didn't do this, contact the business.</p>`,
    ),
  };
}

export function paymentFailedEmail(opts: { to: string; orgName: string; url: string }): Mail {
  return {
    to: opts.to,
    subject: `Payment failed for ${opts.orgName} on HighPre`,
    text: `We couldn't renew your HighPre subscription for ${opts.orgName}, so the account is back on the Free plan. Your data is safe. Update your payment: ${opts.url}`,
    html: layout(
      "Your payment didn't go through",
      `<p>We couldn't renew the HighPre subscription for <strong>${escape(opts.orgName)}</strong>, so the account is on the Free plan for now. Nothing has been deleted and consent keeps being recorded.</p>
       ${button(opts.url, "Update billing")}`,
    ),
  };
}

export function agentAlertEmail(opts: { to: string; orgName: string; memberName: string; device: string; items: { dataType: string; app: string; outcome?: string }[]; url: string }): Mail {
  const what: Record<string, string> = {
    warned: "on the clipboard while %s was open (warned)",
    stopped: "about to be sent to %s (they stopped)",
    blocked: "about to be sent to %s (blocked)",
    sent_anyway: "sent to %s after a warning",
  };
  const lines = opts.items.map((i) => `${dataTypeLabel(i.dataType)} ${(what[i.outcome ?? "warned"] ?? what.warned).replace("%s", appLabel(i.app))}`);
  return {
    to: opts.to,
    subject: `Possible data leak on ${opts.device} — ${opts.orgName}`,
    text: `HighPre on ${opts.device} (${opts.memberName}) detected:\n${lines.map((l) => `- ${l}`).join("\n")}\n\nThe content itself stayed on that computer. Review: ${opts.url}`,
    html: layout(
      "Possible data leak",
      `<p>HighPre on <strong>${escape(opts.device)}</strong> (${escape(opts.memberName)}) found sensitive data heading for an AI or chat app:</p>
       <ul style="padding-left:18px">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
       <p style="color:#8e8e93">The person was warned on their screen. The content stayed on their computer; HighPre only received the type of data, the app and what they chose to do.</p>
       ${button(opts.url, "Review alerts")}`,
    ),
  };
}

export function twoFactorChangedEmail(opts: { to: string; name: string; event: "enabled" | "disabled" | "recovery_used"; url: string }): Mail {
  const what = {
    enabled: "Two-factor sign-in was turned on for your HighPre account. Signing in now needs a code from your authenticator app, and your other sessions were signed out.",
    disabled: "Two-factor sign-in was turned off for your HighPre account. Signing in now needs only your password, and your other sessions were signed out.",
    recovery_used: "A recovery code was used to sign in to your HighPre account. Each code works once; you can create new ones from your account page.",
  }[opts.event];
  const subject = { enabled: "Two-factor sign-in turned on", disabled: "Two-factor sign-in turned off", recovery_used: "A recovery code was used to sign in" }[opts.event];
  return {
    to: opts.to,
    subject: `${subject} — HighPre`,
    text: `Hi ${opts.name}, ${what} If this wasn't you, reset your password straight away and contact support. ${opts.url}`,
    html: layout(
      subject,
      `<p>Hi ${escape(opts.name)},</p>
       <p>${escape(what)}</p>
       ${button(opts.url, "Review your account")}
       <p style="color:#8e8e93">If this wasn't you, reset your password straight away and contact support.</p>`,
    ),
  };
}

export function scanReportEmail(opts: { to: string; site: string; score: number; reportUrl: string; signupUrl: string; pdf: Uint8Array; filename: string }): Mail {
  return {
    to: opts.to,
    subject: `Your HighPre privacy scan for ${opts.site}`,
    text: `Your privacy scan report for ${opts.site} (score ${opts.score}/100) is attached as a PDF. View it online for 30 days: ${opts.reportUrl}\n\nFix the gaps with HighPre: ${opts.signupUrl}\n\nYou're getting this email because you asked for this report. We won't email you again unless you opted in to product updates.`,
    html: layout(
      "Your privacy scan report",
      `<p>The report for <strong>${escape(opts.site)}</strong> is attached as a PDF. It scored <strong>${opts.score}/100</strong>.</p>
       <p>You can also <a href="${opts.reportUrl}" style="color:#000">view it online</a> for 30 days.</p>
       ${button(opts.signupUrl, "Fix these with HighPre")}
       <p style="color:#8e8e93">You're getting this email because you asked for this report. We won't email you again unless you opted in to product updates.</p>`,
    ),
    attachments: [{ filename: opts.filename, content: opts.pdf, contentType: "application/pdf" }],
  };
}

export function siteChangesAlertEmail(opts: { to: string; siteName: string; changes: { severity: string; message: string }[]; url: string }): Mail {
  const critical = opts.changes.some((c) => c.severity === "critical");
  const lines = opts.changes.map((c) => `${c.severity === "critical" ? "Must fix: " : c.severity === "warning" ? "Review: " : ""}${c.message}`);
  return {
    to: opts.to,
    subject: `${critical ? "Action needed" : "Changes found"} on ${opts.siteName} — weekly scan`,
    text: `HighPre's weekly scan of ${opts.siteName} found changes since the previous scan:\n${lines.map((l) => `- ${l}`).join("\n")}\n\nSee the full scan: ${opts.url}`,
    html: layout(
      critical ? "Your website needs attention" : "Your website changed",
      `<p>HighPre's weekly scan of <strong>${escape(opts.siteName)}</strong> found changes since the previous scan:</p>
       <ul style="padding-left:18px">${lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>
       ${button(opts.url, "Open the scan")}
       <p style="color:#8e8e93">You can turn weekly monitoring off in the website's settings.</p>`,
    ),
  };
}

/** Weekly agent summary for owners: company totals only, never who. */
export function agentDigestEmail(opts: {
  to: string;
  orgName: string;
  url: string;
  prevented: number;
  byDataType: { key: string; count: number }[];
  byOutcome: { key: string; count: number }[];
  notCheckingIn: number;
  removed: number;
  aiTools: { app: string; people: number }[];
}): Mail {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const outcomeLabel = (k: string) => (ALERT_OUTCOMES as Record<string, string>)[k] ?? k;
  const sections: { title: string; lines: string[] }[] = [];
  if (opts.byDataType.length) {
    sections.push({ title: "Private data caught", lines: opts.byDataType.map((d) => `${dataTypeLabel(d.key)}: ${d.count}`) });
    sections.push({ title: "What happened", lines: opts.byOutcome.map((o) => `${outcomeLabel(o.key)}: ${o.count}`) });
  }
  const gaps = [
    ...(opts.notCheckingIn ? [`${plural(opts.notCheckingIn, "computer hasn't", "computers haven't")} checked in for a week.`] : []),
    ...(opts.removed ? [`${plural(opts.removed, "computer", "computers")} had HighPre removed this week.`] : []),
  ];
  if (gaps.length) sections.push({ title: "Computers to check", lines: gaps });
  if (opts.aiTools.length) sections.push({ title: "AI tools your team used", lines: opts.aiTools.map((t) => `${appLabel(t.app)}: ${plural(t.people, "person", "people")}`) });
  const headline = opts.prevented
    ? `HighPre stopped private data from leaving ${plural(opts.prevented, "time", "times")} this week.`
    : `Here's your HighPre week at ${opts.orgName}.`;
  return {
    to: opts.to,
    subject: `Your HighPre week — ${opts.orgName}`,
    text: `${headline}\n\n${sections.map((s) => `${s.title}\n${s.lines.map((l) => `- ${l}`).join("\n")}`).join("\n\n")}\n\nCompany totals only. See more: ${opts.url}`,
    html: layout(
      "Your HighPre week",
      `<p>${escape(headline)}</p>
       ${sections.map((s) => `<p style="margin:16px 0 4px"><strong>${escape(s.title)}</strong></p><ul style="padding-left:18px;margin:0">${s.lines.map((l) => `<li>${escape(l)}</li>`).join("")}</ul>`).join("")}
       ${button(opts.url, "Open Desktop agent")}
       <p style="color:#8e8e93">Company totals only. HighPre never sees what anyone types or copies.</p>`,
    ),
  };
}
