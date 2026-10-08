import { connectDb } from "@/lib/db";
import { json, limitOrNull, preflight } from "@/lib/http";
import { ParentalConsent, Site } from "@/models";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/**
 * Lets the widget on a child's browser pick up a parent's decision. Keyed by
 * the child's random visitor id, which only that browser knows.
 */
export async function GET(req: Request) {
  const limited = await limitOrNull(req, "parental-status", 60, 60_000, true);
  if (limited) return limited;

  const url = new URL(req.url);
  const siteKey = url.searchParams.get("site") ?? "";
  const principalId = url.searchParams.get("pid") ?? "";
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(siteKey) || !/^[A-Za-z0-9_-]{16,64}$/.test(principalId)) {
    return json({ error: "Invalid request" }, { status: 400, cors: true });
  }

  await connectDb();
  const site = await Site.findOne({ siteKey }).select("_id publishedNoticeVersion").lean();
  if (!site) return json({ error: "Unknown site" }, { status: 404, cors: true });
  const consent = await ParentalConsent.findOne({ siteId: site._id, principalId }).sort({ createdAt: -1 }).lean();
  if (!consent) return json({ granted: false }, { cors: true, headers: { "Cache-Control": "no-store" } });

  return json(
    {
      granted: true,
      version: consent.noticeVersion,
      decisions: Object.fromEntries(consent.decisions.map((d) => [d.purpose, Boolean(d.granted)])),
    },
    { cors: true, headers: { "Cache-Control": "no-store" } },
  );
}
