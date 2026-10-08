import "server-only";
import { analyzePage } from "./analyze";
import { ScanFetchError, normalizeUrl, safeFetchPage } from "./safe-fetch";
import type { TrackerSignature } from "./signatures";

export { ScanFetchError } from "./safe-fetch";

export type Finding = { id: string; severity: "critical" | "warning" | "pass"; title: string; detail: string };

export type ScanResult = {
  url: string;
  score: number;
  pagesScanned: string[];
  forms: { page: string; fields: string[] }[];
  trackers: { id: string; name: string; category: string }[];
  cookies: string[];
  privacyNoticeUrl?: string;
  consentTool?: string;
  /** Icon declared by the homepage, or the conventional /favicon.ico. */
  faviconUrl: string;
  findings: Finding[];
};

const MAX_EXTRA_PAGES = 4;

/**
 * Scans a homepage plus a few pages likely to contain forms, then turns the
 * raw signals into prioritised findings and a 0–100 readiness score.
 * Static HTML analysis: fast and cheap, but it won't see content injected
 * purely by client-side JavaScript.
 */
export async function scanWebsite(input: string): Promise<ScanResult> {
  const start = normalizeUrl(input);
  const home = await safeFetchPage(start);
  const homeAnalysis = analyzePage(home.html, home.url);

  const extraUrls = homeAnalysis.candidateLinks.filter((u) => u !== home.url).slice(0, MAX_EXTRA_PAGES);
  const extraPages = await Promise.allSettled(extraUrls.map((u) => safeFetchPage(u)));

  const pages = [{ page: home, analysis: homeAnalysis }];
  for (const result of extraPages) {
    if (result.status === "fulfilled") pages.push({ page: result.value, analysis: analyzePage(result.value.html, result.value.url) });
  }

  const trackerMap = new Map<string, TrackerSignature>();
  const forms: ScanResult["forms"] = [];
  const cookies = new Set<string>();
  let privacyNoticeUrl: string | undefined;
  let consentTool: string | undefined;
  let mentionsGrievance = false;

  for (const { page, analysis } of pages) {
    analysis.trackers.forEach((t) => trackerMap.set(t.id, t));
    for (const f of analysis.forms) {
      const fields = [...f.fields].sort();
      // Headers and footers repeat the same form on every page; list it once.
      if (!forms.some((x) => x.fields.join() === fields.join())) forms.push({ page: page.url, fields });
    }
    page.setCookies.forEach((c) => cookies.add(c.split("=")[0].trim()));
    privacyNoticeUrl ??= analysis.privacyLink;
    consentTool ??= analysis.consentTool;
    mentionsGrievance ||= analysis.mentionsGrievance;
  }

  const trackers = [...trackerMap.values()].map(({ id, name, category }) => ({ id, name, category }));
  const findings = buildFindings({
    https: new URL(home.url).protocol === "https:",
    trackers,
    forms,
    privacyNoticeUrl,
    consentTool,
    mentionsGrievance,
  });

  return {
    url: home.url,
    score: scoreFindings(findings),
    pagesScanned: pages.map((p) => p.page.url),
    forms,
    trackers,
    cookies: [...cookies],
    privacyNoticeUrl,
    consentTool,
    faviconUrl: homeAnalysis.iconUrl ?? new URL("/favicon.ico", home.url).toString(),
    findings,
  };
}

export function buildFindings(s: {
  https: boolean;
  trackers: ScanResult["trackers"];
  forms: ScanResult["forms"];
  privacyNoticeUrl?: string;
  consentTool?: string;
  mentionsGrievance: boolean;
}): Finding[] {
  const out: Finding[] = [];
  const nonEssential = s.trackers.filter((t) => t.category !== "support");
  const personalForms = s.forms.filter((f) => f.fields.some((x) => x !== "Message"));

  if (!s.privacyNoticeUrl) {
    out.push({ id: "no_notice", severity: "critical", title: "No privacy notice found", detail: "DPDP requires a clear notice telling people what you collect and why, before or when you collect it." });
  } else {
    out.push({ id: "notice", severity: "pass", title: "Privacy notice linked", detail: "Check it lists each purpose, your grievance contact and how to withdraw consent." });
  }

  if (nonEssential.length > 0 && !s.consentTool) {
    out.push({
      id: "trackers_without_consent",
      severity: "critical",
      title: `${nonEssential.length} tracker${nonEssential.length > 1 ? "s" : ""} load without asking`,
      detail: `${nonEssential.map((t) => t.name).join(", ")} run before visitors agree. Load them only after consent.`,
    });
  } else if (s.consentTool) {
    out.push({ id: "consent_tool", severity: "pass", title: `Consent tool detected (${s.consentTool})`, detail: "Make sure withdrawing consent is as easy as giving it." });
  }

  if (personalForms.length > 0) {
    const fields = [...new Set(personalForms.flatMap((f) => f.fields))];
    out.push({
      id: "forms_collect_data",
      severity: "warning",
      title: `${personalForms.length} form${personalForms.length > 1 ? "s" : ""} collect personal data`,
      detail: `Fields found: ${fields.join(", ")}. Each form needs notice and consent for its purpose, and you must be able to delete this data on request.`,
    });
  }

  if (!s.mentionsGrievance) {
    out.push({ id: "no_grievance", severity: "warning", title: "No grievance contact found", detail: "Publish who people can contact about their data, and how." });
  } else {
    out.push({ id: "grievance", severity: "pass", title: "Grievance contact mentioned", detail: "Keep it current and respond within your published timeline." });
  }

  out.push(
    s.https
      ? { id: "https", severity: "pass", title: "Served over HTTPS", detail: "Data in transit is encrypted." }
      : { id: "no_https", severity: "critical", title: "Not served over HTTPS", detail: "Personal data submitted on this site travels unencrypted. Enable HTTPS." },
  );

  const order = { critical: 0, warning: 1, pass: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function scoreFindings(findings: Finding[]): number {
  const penalty = findings.reduce((sum, f) => sum + (f.severity === "critical" ? 25 : f.severity === "warning" ? 10 : 0), 0);
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function scanErrorMessage(error: unknown): string {
  return error instanceof ScanFetchError ? error.message : "The scan failed unexpectedly. Try again in a minute.";
}
