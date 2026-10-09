import "server-only";
import type { Types } from "mongoose";
import { orgChecklist, readinessScore, siteChecklist } from "@/lib/compliance/checklist";
import { BREACH_CHECKLIST, dataCategoryLabel, isTracking, requestStatusLabel, requestTypeLabel } from "@/lib/constants";
import { consentAnalytics, percent, rate } from "@/lib/consent/analytics";
import { consentHash, ledgerDigest } from "@/lib/consent/hash";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { languageLabel, normalizeLanguages } from "@/lib/i18n/languages";
import { retentionText } from "@/lib/notice/generate";
import { dpaStatusLabel, vendorCategoryLabel } from "@/lib/vendors/constants";
import { vendorCoverage } from "@/lib/vendors/sync";
import { AuditLog, Breach, ConsentRecord, Notice, ParentalConsent, RightsRequest, Scan, Site, User, Vendor } from "@/models";
import type { AuthContext } from "@/lib/auth/guards";
import { PdfWriter } from "./pdf";

type Org = AuthContext["org"];

export type LedgerCheck = { records: number; verified: number; legacy: number; mismatched: number; digest: string };

/**
 * Re-computes every consent record's hash. "legacy" records predate hashing;
 * a mismatch means stored evidence changed after it was written.
 */
export async function checkLedger(siteId: Types.ObjectId, range: { from: Date; to: Date }): Promise<LedgerCheck> {
  const result: LedgerCheck = { records: 0, verified: 0, legacy: 0, mismatched: 0, digest: "" };
  const hashes: string[] = [];
  const cursor = ConsentRecord.find({ siteId, createdAt: { $gte: range.from, $lte: range.to } })
    .sort({ createdAt: 1, _id: 1 })
    .lean()
    .cursor();
  for await (const r of cursor) {
    result.records++;
    if (!r.hash) {
      result.legacy++;
      continue;
    }
    const expected = consentHash({
      siteId: String(r.siteId),
      principalId: r.principalId,
      action: r.action,
      noticeVersion: r.noticeVersion,
      decisions: r.decisions,
      language: r.language,
      ageGroup: r.ageGroup,
      parentalConsentId: r.parentalConsentId ? String(r.parentalConsentId) : null,
      source: r.source,
      formId: r.formId,
      receiptId: r.receiptId,
      createdAt: r.createdAt,
    });
    if (expected === r.hash) result.verified++;
    else result.mismatched++;
    hashes.push(r.hash);
  }
  result.digest = ledgerDigest(hashes);
  return result;
}

/** Builds the PDF evidence pack for one organisation and period. */
export async function buildEvidencePack(org: Org, generatedBy: string, range: { from: Date; to: Date }): Promise<Uint8Array> {
  const business = org.legalName || org.name;
  const pdf = await PdfWriter.create(`DPDP evidence pack - ${business}`);
  const inRange = { $gte: range.from, $lte: range.to };

  const [sites, members, requests, breaches, activity] = await Promise.all([
    Site.find({ orgId: org._id }).sort({ createdAt: 1 }).lean(),
    User.find({ _id: { $in: org.members.map((m) => m.userId) } }).select("name email").lean(),
    RightsRequest.find({ orgId: org._id, createdAt: inRange }).sort({ createdAt: -1 }).lean(),
    Breach.find({ orgId: org._id, discoveredAt: inRange }).sort({ discoveredAt: -1 }).lean(),
    AuditLog.find({ orgId: org._id, createdAt: inRange }).sort({ createdAt: -1 }).limit(150).lean(),
  ]);

  const now = new Date();
  const openRequests = await RightsRequest.find({ orgId: org._id, status: { $in: ["open", "in_progress"] } }).select("dueAt").lean();
  const overdue = openRequests.filter((r) => r.dueAt < now).length;
  const openBreaches = await Breach.countDocuments({ orgId: org._id, closedAt: { $exists: false } });
  const vendors = await Vendor.find({ orgId: org._id, archivedAt: null }).sort({ name: 1 }).lean();
  const items = [
    ...orgChecklist(org, { overdueRequests: overdue, openBreaches, vendors: await vendorCoverage(org._id) }),
    ...sites.flatMap((s) => siteChecklist({ ...s, id: String(s._id) })),
  ];

  // ── Cover ──
  pdf.title("DPDP compliance evidence pack", business);
  pdf.keyValues([
    ["Period", `${formatDate(range.from)} to ${formatDate(range.to)}`],
    ["Generated", `${formatDateTime(now)} by ${generatedBy}`],
    ["Readiness score", `${readinessScore(items)}% (${items.filter((i) => i.done).length} of ${items.length} checklist items done)`],
    ["Websites", sites.length],
    ["Data requests in period", requests.length],
    ["Breaches in period", breaches.length],
  ]);
  pdf.paragraph(
    "This pack summarises the records HighPre keeps for the business under India's Digital Personal Data Protection Act, 2023: privacy notices, the consent ledger, data principal requests, breach response and account activity. It is generated from live records and is not legal advice.",
    { muted: true },
  );

  // ── Organisation ──
  pdf.heading("Data fiduciary and grievance contact");
  pdf.keyValues([
    ["Legal name", business],
    ["Registered address", org.address || "Not provided"],
    ["Grievance officer", org.grievanceOfficerName || "Not provided"],
    ["Grievance email", org.grievanceEmail || "Not provided"],
    ["Grievance phone", org.grievancePhone || "Not provided"],
    ["Published response time", `${org.responseDays} days`],
  ]);
  pdf.heading("Team", 2);
  const userById = new Map(members.map((u) => [String(u._id), u]));
  pdf.table(
    [
      { header: "Name", width: 0.35 },
      { header: "Email", width: 0.45 },
      { header: "Role", width: 0.2 },
    ],
    org.members.map((m) => {
      const u = userById.get(String(m.userId));
      return [u?.name ?? "Unknown", u?.email ?? "", ROLE_LABELS[m.role] ?? m.role];
    }),
  );

  // ── Websites ──
  for (const site of sites) {
    pdf.heading(`Website: ${site.name}`);
    const [notices, lastScan, ledger, byAction, parental] = await Promise.all([
      Notice.find({ siteId: site._id }).sort({ version: -1 }).select("version createdAt languages purposeKeys").lean(),
      Scan.findOne({ siteId: site._id, status: "complete" }).sort({ createdAt: -1 }).lean(),
      checkLedger(site._id, range),
      ConsentRecord.aggregate<{ _id: string; n: number }>([{ $match: { siteId: site._id, createdAt: inRange } }, { $group: { _id: "$action", n: { $sum: 1 } } }]),
      ParentalConsent.countDocuments({ siteId: site._id, createdAt: inRange }),
    ]);
    const count = (a: string) => byAction.find((x) => x._id === a)?.n ?? 0;

    pdf.keyValues([
      ["Address", site.url],
      ["Languages offered", normalizeLanguages(site.languages).map(languageLabel).join(", ")],
      ["Current notice", site.publishedNoticeVersion ? `Version ${site.publishedNoticeVersion}` : "Not published"],
      ["Consent banner", site.widgetLastSeenAt ? `Installed, last seen ${formatDateTime(site.widgetLastSeenAt)}` : "Not detected"],
      ["Age check and parental consent", site.children?.enabled ? "On" : "Off"],
    ]);

    pdf.heading("Processing purposes (data inventory)", 2);
    pdf.table(
      [
        { header: "Purpose", width: 0.25 },
        { header: "Data", width: 0.27 },
        { header: "Kept for", width: 0.13 },
        { header: "Basis", width: 0.15 },
        { header: "Shared with", width: 0.2 },
      ],
      site.purposes.map((p) => [
        p.name,
        p.dataCategories.map(dataCategoryLabel).join(", "),
        retentionText(p.retentionDays, "en"),
        p.essential ? "Necessary" : isTracking(p) ? "Consent (tracking)" : "Consent",
        p.sharedWith || "-",
      ]),
    );

    pdf.heading("Notice versions", 2);
    pdf.table(
      [
        { header: "Version", width: 0.12 },
        { header: "Published", width: 0.25 },
        { header: "Languages", width: 0.33 },
        { header: "Purposes", width: 0.3 },
      ],
      notices.map((n) => [n.version, formatDateTime(n.createdAt), (n.languages ?? ["en", "hi"]).map(languageLabel).join(", "), n.purposeKeys.join(", ")]),
      "No notice published.",
    );

    pdf.heading("Consent ledger in this period", 2);
    pdf.keyValues([
      ["Decisions recorded", formatNumber(ledger.records)],
      ["Consent given / changed / withdrawn", `${formatNumber(count("grant"))} / ${formatNumber(count("update"))} / ${formatNumber(count("withdraw"))}`],
      ["Parental consents", formatNumber(parental)],
      [
        "Integrity check",
        ledger.mismatched > 0
          ? `${formatNumber(ledger.mismatched)} record(s) don't match their hash and may have been altered`
          : `${formatNumber(ledger.verified)} verified${ledger.legacy ? `, ${formatNumber(ledger.legacy)} recorded before hashing was introduced` : ""}, none altered`,
      ],
      ["Ledger digest (SHA-256)", ledger.digest],
    ]);

    // Always the 90 days to generation, whatever period the pack covers. Counts decision events, not visitors.
    const stats = await consentAnalytics([site], 90, now);
    const share = (n: number) => `${formatNumber(n)} (${percent(rate(n, stats.total))})`;
    pdf.heading("Consent statistics (last 90 days)", 2);
    pdf.keyValues([
      ["Decisions recorded", formatNumber(stats.total)],
      ["Accepted all", share(stats.mix.accept)],
      ["Rejected all", share(stats.mix.reject)],
      ["Chose purposes", share(stats.mix.custom)],
      ["Withdrew consent", share(stats.mix.withdraw)],
    ]);
    pdf.table(
      [
        { header: "Optional purpose", width: 0.5 },
        { header: "Allowed", width: 0.25 },
        { header: "Opt-in rate", width: 0.25 },
      ],
      stats.purposes.map((p) => [p.name, `${formatNumber(p.granted)} of ${formatNumber(p.total)}`, percent(p.rate)]),
      "No optional purposes were answered.",
    );

    if (lastScan) {
      pdf.heading(`Latest website scan: ${formatDate(lastScan.createdAt)}, score ${lastScan.score}/100`, 2);
      pdf.table(
        [
          { header: "Result", width: 0.15 },
          { header: "Finding", width: 0.35 },
          { header: "Detail", width: 0.5 },
        ],
        lastScan.findings.map((f) => [f.severity === "pass" ? "OK" : f.severity === "critical" ? "Must fix" : "Review", f.title, f.detail]),
      );
    }
  }

  // ── Vendors ──
  pdf.heading("Vendors and processors");
  pdf.table(
    [
      { header: "Vendor", width: 0.26 },
      { header: "Category", width: 0.2 },
      { header: "Processed in", width: 0.17 },
      { header: "DPA status", width: 0.17 },
      { header: "Signed", width: 0.2 },
    ],
    vendors.map((v) => [v.name, vendorCategoryLabel(v.category), v.processingCountry || "-", dpaStatusLabel(v.dpaStatus), v.dpaSignedAt ? formatDate(v.dpaSignedAt) : "-"]),
    "No vendors recorded.",
  );

  // ── Requests ──
  pdf.heading("Data principal requests");
  const closed = requests.filter((r) => r.resolvedAt);
  const onTime = closed.filter((r) => r.resolvedAt! <= r.dueAt).length;
  pdf.keyValues([
    ["Received in period", requests.length],
    ["Closed", `${closed.length}${closed.length ? `, ${Math.round((onTime / closed.length) * 100)}% within the published deadline` : ""}`],
    ["Open now, overdue", `${openRequests.length}, ${overdue} overdue`],
  ]);
  pdf.table(
    [
      { header: "Reference", width: 0.15 },
      { header: "Type", width: 0.22 },
      { header: "Received", width: 0.17 },
      { header: "Due", width: 0.15 },
      { header: "Closed", width: 0.16 },
      { header: "Status", width: 0.15 },
    ],
    requests.slice(0, 200).map((r) => [
      r.reference,
      requestTypeLabel(r.type),
      formatDate(r.createdAt!),
      formatDate(r.dueAt),
      r.resolvedAt ? formatDate(r.resolvedAt) : "-",
      requestStatusLabel(r.status),
    ]),
    "No requests in this period.",
  );

  // ── Breaches ──
  pdf.heading("Personal data breaches");
  if (breaches.length === 0) pdf.paragraph("No breaches were logged in this period.", { muted: true });
  for (const b of breaches) {
    pdf.heading(`${b.reference}: ${b.title}`, 2);
    pdf.keyValues([
      ["Discovered", formatDateTime(b.discoveredAt)],
      ["Report due to the Board", formatDateTime(b.reportDueAt)],
      ["Severity", b.severity],
      ["People affected", b.affectedCount ?? "Unknown"],
      ["Data involved", b.dataCategories.map(dataCategoryLabel).join(", ") || "Not specified"],
      ["Closed", b.closedAt ? formatDateTime(b.closedAt) : "Open"],
    ]);
    const done = new Map(b.steps.map((s) => [s.key, s.doneAt]));
    pdf.table(
      [
        { header: "Step", width: 0.6 },
        { header: "Completed", width: 0.4 },
      ],
      BREACH_CHECKLIST.map((s) => [s.label, done.get(s.key) ? formatDateTime(done.get(s.key)!) : "Not done"]),
    );
  }

  // ── Activity ──
  pdf.heading("Account activity");
  pdf.table(
    [
      { header: "When", width: 0.22 },
      { header: "Who", width: 0.2 },
      { header: "What", width: 0.58 },
    ],
    activity.map((a) => [formatDateTime(a.createdAt!), a.actorName, a.summary]),
    "No activity recorded in this period.",
  );

  return pdf.finish(`HighPre evidence pack · ${business} · ${formatDate(now)}`);
}
