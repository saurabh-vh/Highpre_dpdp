import { CERT_WARNING_DAYS, classifyCertificate } from "./security";

/**
 * Compares a scan with the site's previous complete scan and lists what got
 * worse (or better) in plain words. Pure, so it runs on stored documents and
 * fresh scan results alike. Warning and critical changes trigger alerts from
 * the weekly monitoring job.
 */

export type ChangeSeverity = "critical" | "warning" | "info";
export type ScanChange = { kind: string; severity: ChangeSeverity; message: string };

type ScanLike = {
  url: string;
  score?: number | null;
  trackers: { id?: string | null; name?: string | null }[];
  consentTool?: string | null;
  privacyNoticeUrl?: string | null;
  findings: { id: string }[];
  security?: { certificate?: { validTo?: Date | null; authorized?: boolean | null } | null } | null;
};

export const SCORE_DROP_ALERT = 10;

const isHttps = (s: ScanLike) => new URL(s.url).protocol === "https:" && !s.findings.some((f) => f.id === "no_https");
const hasGrievance = (s: ScanLike) => s.findings.some((f) => f.id === "grievance");
const names = (list: { name?: string | null }[]) => list.map((t) => t.name).filter(Boolean).join(", ");

export function detectChanges(previous: ScanLike, current: ScanLike, now = new Date()): ScanChange[] {
  const out: ScanChange[] = [];
  const before = new Set(previous.trackers.map((t) => t.id));
  const after = new Set(current.trackers.map((t) => t.id));
  const added = current.trackers.filter((t) => !before.has(t.id));
  const removed = previous.trackers.filter((t) => !after.has(t.id));

  if (added.length > 0) {
    out.push({ kind: "trackers_added", severity: "warning", message: `New tracker${added.length > 1 ? "s" : ""} found: ${names(added)}. Check they load only after consent and add them to your inventory.` });
  }
  if (removed.length > 0) {
    out.push({ kind: "trackers_removed", severity: "info", message: `No longer found: ${names(removed)}.` });
  }
  if (previous.consentTool && !current.consentTool) {
    out.push({ kind: "consent_tool_lost", severity: "critical", message: `The consent banner (${previous.consentTool}) is no longer detected. Trackers may now load without asking.` });
  }
  if (previous.privacyNoticeUrl && !current.privacyNoticeUrl) {
    out.push({ kind: "privacy_notice_lost", severity: "critical", message: "The link to your privacy notice is no longer found on the pages we checked." });
  }
  if (hasGrievance(previous) && !hasGrievance(current)) {
    out.push({ kind: "grievance_lost", severity: "warning", message: "Your grievance contact is no longer mentioned on the pages we checked." });
  }
  if (isHttps(previous) && !isHttps(current)) {
    out.push({ kind: "https_lost", severity: "critical", message: "The website is no longer served over HTTPS." });
  }

  // Certificate health is reported on every scan while it's a problem, not only when it changes:
  // an expiring certificate is worth repeating.
  const cert = current.security?.certificate;
  if (cert?.validTo && isHttps(current)) {
    const status = classifyCertificate({ validTo: cert.validTo, authorized: cert.authorized ?? true }, now);
    if (status.expired) out.push({ kind: "ssl_expired", severity: "critical", message: "The SSL certificate has expired. Visitors now see a security warning." });
    else if (status.daysLeft < CERT_WARNING_DAYS) out.push({ kind: "ssl_expiring", severity: "warning", message: `The SSL certificate expires in ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"}.` });
  }

  const drop = (previous.score ?? 0) - (current.score ?? 0);
  if (drop >= SCORE_DROP_ALERT) {
    out.push({ kind: "score_dropped", severity: "warning", message: `The scan score fell by ${drop} points, from ${previous.score} to ${current.score}.` });
  }

  const order = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/** Changes worth emailing someone about. */
export const alertable = (changes: ScanChange[]) => changes.filter((c) => c.severity !== "info");
