import { BADGE_HEADERS, badgeSvg, isSiteKey, parseBadgeOptions } from "@/lib/privacy-centre/badge";

/**
 * Embeddable "Privacy centre by HighPre" badge for customer websites:
 * <img src="/p/<siteKey>/badge.svg?theme=dark&size=small">. Static per
 * theme and size, so it needs no database lookup and caches well.
 */
export async function GET(req: Request, { params }: { params: Promise<{ siteKey: string }> }) {
  const { siteKey } = await params;
  if (!isSiteKey(siteKey)) return new Response("Not found", { status: 404 });
  const options = parseBadgeOptions(new URL(req.url).searchParams);
  return new Response(badgeSvg(options), { status: 200, headers: BADGE_HEADERS });
}
