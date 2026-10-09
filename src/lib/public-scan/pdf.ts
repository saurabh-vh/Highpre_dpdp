import { PdfWriter } from "@/lib/evidence/pdf";
import { formatDate } from "@/lib/format";

export type ScanReportPdfInput = {
  url: string;
  score: number;
  createdAt: Date;
  pagesScanned: string[];
  trackers: { name?: string | null; category?: string | null }[];
  forms: { page?: string | null; fields: string[] }[];
  findings: { id: string; severity: string; title: string; detail?: string | null }[];
  /** Absolute links for the call to action and the online copy. */
  appUrl: string;
  reportUrl: string;
};

const SEVERITY = { critical: "Must fix", warning: "Review", pass: "Looks good" } as Record<string, string>;

/** Concrete next steps for the common findings; other findings fall back to their own detail. */
const FIX_STEPS: Record<string, string> = {
  no_notice: "Publish a privacy notice that lists each purpose, the data used for it, how long you keep it, and who to contact. Link it from every page and every form.",
  trackers_without_consent: "Install a consent banner and hold back analytics, advertising and session-recording scripts until the visitor agrees. Make saying no as easy as saying yes.",
  forms_collect_data: "Add a short notice and, where consent is the basis, an unticked checkbox next to each form. Keep a record of what each person agreed to.",
  no_grievance: "Name a grievance officer (or contact) with an email address in your notice, and reply to requests within your published timeline.",
  no_https: "Turn on HTTPS for the whole site (most hosts offer free certificates) and redirect plain HTTP to it.",
};

export function scoreLabel(score: number): string {
  if (score >= 80) return "Good foundation";
  if (score >= 50) return "Needs work";
  return "At risk";
}

function host(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** Branded PDF of a free public scan: score, findings by severity, what to fix, and how HighPre helps. */
export async function buildScanReportPdf(input: ScanReportPdfInput): Promise<Uint8Array> {
  const site = host(input.url);
  const pdf = await PdfWriter.create(`HighPre privacy scan - ${site}`);
  const toFix = input.findings.filter((f) => f.severity !== "pass");
  const passed = input.findings.filter((f) => f.severity === "pass");

  pdf.paragraph("HIGHPRE  ·  DPDP WEBSITE SCAN", { muted: true, size: 8, bold: true });
  pdf.title(`Privacy scan for ${site}`, `Scanned on ${formatDate(input.createdAt)} · ${input.pagesScanned.length} page${input.pagesScanned.length === 1 ? "" : "s"} checked`);

  pdf.heading("Readiness score");
  pdf.paragraph(`${input.score} / 100 - ${scoreLabel(input.score)}`, { size: 18, bold: true });
  pdf.paragraph(
    toFix.length > 0
      ? `We found ${toFix.length} thing${toFix.length === 1 ? "" : "s"} to fix or review before the Digital Personal Data Protection Act's obligations apply in full on 13 May 2027.`
      : "No major gaps in what we could see. Consent records and handling data requests still need to be in place.",
  );

  pdf.heading("Findings");
  pdf.table(
    [
      { header: "Status", width: 0.16 },
      { header: "Finding", width: 0.34 },
      { header: "Details", width: 0.5 },
    ],
    input.findings.map((f) => [SEVERITY[f.severity] ?? f.severity, f.title, f.detail ?? ""]),
    "No findings.",
  );

  if (toFix.length > 0) {
    pdf.heading("What to fix");
    toFix.forEach((f, i) => {
      pdf.heading(`${i + 1}. ${f.title}`, 2);
      pdf.paragraph(FIX_STEPS[f.id] ?? f.detail ?? "");
    });
  }

  pdf.heading("What we found on your pages");
  pdf.heading("Trackers", 2);
  pdf.table(
    [
      { header: "Tracker", width: 0.6 },
      { header: "Type", width: 0.4 },
    ],
    input.trackers.map((t) => [t.name ?? "", (t.category ?? "").replace(/_/g, " ")]),
    "None detected in the page source.",
  );
  pdf.heading("Forms collecting personal data", 2);
  pdf.table(
    [
      { header: "Page", width: 0.5 },
      { header: "Fields", width: 0.5 },
    ],
    input.forms.slice(0, 12).map((f) => [f.page ?? "", f.fields.join(", ")]),
    "None found on the pages we checked.",
  );
  if (passed.length > 0) pdf.paragraph(`Already in place: ${passed.map((f) => f.title).join("; ")}.`, { muted: true });

  pdf.heading("Fix these with HighPre");
  pdf.paragraph(
    "HighPre writes your privacy notice in English and Indian languages, adds a consent banner that holds back trackers until people agree, records every consent as evidence, and tracks data requests to their deadline.",
  );
  pdf.paragraph(`Create your free account: ${input.appUrl}/register`, { bold: true });
  pdf.paragraph(`View this report online (for 30 days): ${input.reportUrl}`, { muted: true });
  pdf.space(6);
  pdf.paragraph(
    "This scan reads your pages' HTML, so content added later by JavaScript may not appear. It's a starting point, not a legal audit or a certification.",
    { muted: true, size: 8 },
  );

  return pdf.finish(`HighPre scan of ${site} · ${formatDate(input.createdAt)}`);
}
