import { appendConsent } from "@/lib/consent/record";
import { connectDb } from "@/lib/db";
import { clientIp, hashIp, json, limitOrNull, preflight } from "@/lib/http";
import { consentEventSchema } from "@/lib/validation";
import { Site } from "@/models";

export const OPTIONS = preflight;

/**
 * Appends a consent decision to the ledger. The widget sends text/plain to
 * avoid a CORS preflight, so the body is parsed manually.
 */
export async function POST(req: Request) {
  const limited = await limitOrNull(req, "consent", 60, 60_000, true);
  if (limited) return limited;

  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400, cors: true });
  }
  const parsed = consentEventSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid consent event" }, { status: 422, cors: true });
  const event = parsed.data;

  await connectDb();
  const site = await Site.findOne({ siteKey: event.siteKey }).select("purposes publishedNoticeVersion children").lean();
  if (!site) return json({ error: "Unknown site" }, { status: 404, cors: true });
  if (event.noticeVersion !== site.publishedNoticeVersion) {
    return json({ error: "Notice version is out of date. Reload the page." }, { status: 409, cors: true });
  }

  // Only keep decisions for purposes that exist; essential purposes are always on.
  // A self-declared child gets essential purposes only: anything more needs a parent (see /api/public/parental).
  const child = Boolean(site.children?.enabled) && event.ageGroup === "child";
  const known = new Map(site.purposes.map((p) => [p.key, p.essential]));
  const decisions = event.decisions
    .filter((d) => known.has(d.purpose))
    .map((d) => ({ purpose: d.purpose, granted: known.get(d.purpose) ? true : child ? false : d.granted }));

  await appendConsent({
    siteId: site._id,
    principalId: event.principalId,
    action: event.action,
    noticeVersion: event.noticeVersion,
    decisions,
    language: event.language,
    ageGroup: site.children?.enabled ? event.ageGroup : undefined,
    pageUrl: event.pageUrl?.slice(0, 500),
    ipHash: hashIp(clientIp(req)),
    userAgent: req.headers.get("user-agent")?.slice(0, 300),
  });

  return json({ ok: true }, { status: 201, cors: true });
}
