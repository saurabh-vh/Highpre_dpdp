import { audit } from "@/lib/audit";
import { requireAuth, requireSite } from "@/lib/auth/guards";
import { ConsentRecord } from "@/models";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Streams the full consent ledger as CSV, oldest first. */
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [{ org, user }, site] = await Promise.all([requireAuth(), requireSite(siteId)]);
  await audit(org._id, user, "export.consents", `Exported the consent ledger for ${site.name}`, site._id);
  const cursor = ConsentRecord.find({ siteId: site._id }).sort({ createdAt: 1 }).lean().cursor();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("timestamp,visitor_id,action,notice_version,language,age_group,parental_consent_id,granted,refused,page_url,record_hash\n"));
      for await (const r of cursor) {
        const granted = r.decisions.filter((d) => d.granted).map((d) => d.purpose).join(" ");
        const refused = r.decisions.filter((d) => !d.granted).map((d) => d.purpose).join(" ");
        const row = [r.createdAt?.toISOString(), r.principalId, r.action, r.noticeVersion, r.language, r.ageGroup, r.parentalConsentId, granted, refused, r.pageUrl, r.hash];
        controller.enqueue(encoder.encode(row.map(csvCell).join(",") + "\n"));
      }
      controller.close();
    },
  });

  const filename = `consents-${site.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
