import type { CheerioAPI } from "cheerio/slim";
import { formatDate } from "@/lib/format";

/**
 * Security signals for DPDP's "reasonable security safeguards": response
 * headers, the TLS certificate, mixed content, forms posting over plain http
 * and cookie flags. Pure functions (the certificate is fetched in cert.ts), so
 * they can be tested on fixtures.
 */

export type HeaderMap = Record<string, string | string[] | undefined>;

export type HeaderCheck = { missing: string[]; present: string[] };

export type CertificateInfo = {
  validTo: Date;
  issuer: string;
  /** False when the chain doesn't verify (self-signed, wrong host, expired...). */
  authorized: boolean;
  error?: string;
};

export type SecurityReport = {
  headers: HeaderCheck;
  certificate?: CertificateInfo;
  mixedContent: { count: number; examples: string[] };
  insecureForms: string[];
  insecureCookies: string[];
};

export const CERT_WARNING_DAYS = 14;

/** Headers whose absence leaves visitors exposed (downgrade, clickjacking). The rest are good practice. */
const MAJOR_HEADERS = new Set(["Strict-Transport-Security", "Clickjacking protection"]);

const header = (headers: HeaderMap, name: string): string => {
  const value = headers[name.toLowerCase()];
  return (Array.isArray(value) ? value.join(", ") : (value ?? "")).trim();
};

/** Which recommended security headers the homepage response sets. HSTS only applies over https. */
export function checkHeaders(headers: HeaderMap, https: boolean): HeaderCheck {
  const csp = header(headers, "content-security-policy");
  const checks: [string, boolean][] = [
    ["Clickjacking protection", Boolean(header(headers, "x-frame-options")) || /frame-ancestors/i.test(csp)],
    ["Content-Security-Policy", Boolean(csp)],
    ["X-Content-Type-Options", /nosniff/i.test(header(headers, "x-content-type-options"))],
    ["Referrer-Policy", Boolean(header(headers, "referrer-policy"))],
  ];
  if (https) checks.unshift(["Strict-Transport-Security", /max-age=\s*[1-9]/i.test(header(headers, "strict-transport-security"))]);
  return { missing: checks.filter(([, ok]) => !ok).map(([n]) => n), present: checks.filter(([, ok]) => ok).map(([n]) => n) };
}

const MIXED_SELECTORS: [string, string][] = [
  ["script[src]", "src"],
  ["iframe[src]", "src"],
  ['link[rel~="stylesheet"][href]', "href"],
  ["img[src]", "src"],
  ["video[src], audio[src], source[src]", "src"],
  ["form[action]", "action"],
];

/** http:// scripts, frames, stylesheets, media and form targets on an https page. */
export function findMixedContent($: CheerioAPI, pageUrl: string): string[] {
  if (new URL(pageUrl).protocol !== "https:") return [];
  const found = new Set<string>();
  for (const [selector, attr] of MIXED_SELECTORS) {
    $(selector).each((_, el) => {
      const value = ($(el).attr(attr) ?? "").trim();
      if (/^http:\/\//i.test(value)) found.add(value);
    });
  }
  return [...found];
}

/** Where a form submits to, resolved against the page; null if the action is unusable. */
export function formTarget(action: string | undefined, pageUrl: string): string | null {
  try {
    const url = new URL(action?.trim() || pageUrl, pageUrl);
    return /^https?:$/.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

const SESSION_COOKIE = /sess|sid|auth|token|login|jwt|remember/i;

/** Cookies set without Secure (on https), and session-looking cookies readable by scripts. */
export function checkCookies(setCookies: string[], https: boolean): string[] {
  const out = new Set<string>();
  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(";");
    const name = pair.split("=")[0].trim();
    if (!name) continue;
    const flags = attrs.map((a) => a.trim().split("=")[0].toLowerCase());
    const problems: string[] = [];
    if (https && !flags.includes("secure")) problems.push("no Secure flag");
    if (SESSION_COOKIE.test(name) && !flags.includes("httponly")) problems.push("readable by scripts");
    if (problems.length) out.add(`${name} (${problems.join(", ")})`);
  }
  return [...out];
}

export type CertStatus = { severity: "critical" | "warning" | "pass"; daysLeft: number; expired: boolean };

/** Expired or unverifiable certificates are critical; under 14 days left is a warning. */
export function classifyCertificate(cert: Pick<CertificateInfo, "validTo" | "authorized">, now = new Date()): CertStatus {
  const daysLeft = Math.floor((new Date(cert.validTo).getTime() - now.getTime()) / 86_400_000);
  const expired = new Date(cert.validTo).getTime() <= now.getTime();
  const severity = expired || !cert.authorized ? "critical" : daysLeft < CERT_WARNING_DAYS ? "warning" : "pass";
  return { severity, daysLeft, expired };
}

type Finding = { id: string; severity: "critical" | "warning" | "pass"; title: string; detail: string; group: "security" };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One finding per area, so a site missing several headers sees one item, not four. */
export function securityFindings(s: SecurityReport, https: boolean, now = new Date()): Finding[] {
  const out: Finding[] = [];
  const push = (f: Omit<Finding, "group">) => out.push({ ...f, group: "security" });

  if (https && s.certificate) {
    const c = classifyCertificate(s.certificate, now);
    const issuer = s.certificate.issuer ? ` Issued by ${s.certificate.issuer}.` : "";
    if (c.expired) {
      push({ id: "ssl_expired", severity: "critical", title: "SSL certificate has expired", detail: `It expired on ${formatDate(s.certificate.validTo)}. Browsers warn visitors away and data in transit isn't trustworthy. Renew it now.${issuer}` });
    } else if (!s.certificate.authorized) {
      push({ id: "ssl_invalid", severity: "critical", title: "SSL certificate isn't trusted", detail: `Browsers can't verify it (${s.certificate.error ?? "self-signed or for another domain"}). Install a certificate from a trusted authority.${issuer}` });
    } else if (c.severity === "warning") {
      push({ id: "ssl_expiring", severity: "warning", title: `SSL certificate expires in ${plural(c.daysLeft, "day")}`, detail: `Valid until ${formatDate(s.certificate.validTo)}. Renew it, or check that automatic renewal is working.${issuer}` });
    } else {
      push({ id: "ssl", severity: "pass", title: "SSL certificate valid", detail: `Valid until ${formatDate(s.certificate.validTo)}.${issuer}` });
    }
  }

  const major = s.headers.missing.filter((h) => MAJOR_HEADERS.has(h));
  if (major.length > 0) {
    push({
      id: "security_headers",
      severity: "warning",
      title: `${plural(s.headers.missing.length, "security header")} missing`,
      detail: `Missing: ${s.headers.missing.join(", ")}. These tell browsers to keep visitors on https and stop other sites framing your pages. Your host or CDN can usually add them.`,
    });
  } else {
    push({
      id: "security_headers_ok",
      severity: "pass",
      title: "Key security headers set",
      detail: s.headers.missing.length ? `Also worth adding: ${s.headers.missing.join(", ")}.` : "HSTS, clickjacking protection, CSP, nosniff and a referrer policy are all in place.",
    });
  }

  if (s.insecureForms.length > 0) {
    push({
      id: "insecure_forms",
      severity: "critical",
      title: `${plural(s.insecureForms.length, "form")} send personal data over plain http`,
      detail: `Submissions go to ${s.insecureForms.slice(0, 3).join(", ")}${s.insecureForms.length > 3 ? "…" : ""} unencrypted. Point them at an https address.`,
    });
  }

  if (s.mixedContent.count > 0) {
    push({
      id: "mixed_content",
      severity: "warning",
      title: `${plural(s.mixedContent.count, "resource")} load over plain http`,
      detail: `An https page that loads http:// files can be tampered with in transit, and browsers may block them. For example: ${s.mixedContent.examples.join(", ")}.`,
    });
  }

  if (s.insecureCookies.length > 0) {
    push({
      id: "insecure_cookies",
      severity: "warning",
      title: `${plural(s.insecureCookies.length, "cookie")} without safe flags`,
      detail: `${s.insecureCookies.slice(0, 5).join("; ")}. Set Secure on every cookie served over https, and HttpOnly on session cookies.`,
    });
  }

  return out;
}
