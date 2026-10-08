import { isDesktopPlatform } from "@/lib/agent/catalog";
import { deviceFromRequest } from "@/lib/agent/ingest";
import { updateOffer } from "@/lib/agent/update";

export const dynamic = "force-dynamic";

/**
 * Offers a newer signed build: version, SHA-256 and Ed25519 signature. The
 * agent verifies the signature against the public key compiled into it, so
 * this endpoint can't make it run anything unsigned. 204 when up to date.
 */
export async function GET(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return Response.json({ error: "Unknown or removed device" }, { status: 401 });
  const url = new URL(req.url);
  const platform = url.searchParams.get("platform") ?? "";
  const version = (url.searchParams.get("version") ?? "").slice(0, 20);
  if (!isDesktopPlatform(platform)) return Response.json({ error: "Unknown platform" }, { status: 400 });
  const offer = await updateOffer(platform, version);
  if (!offer) return new Response(null, { status: 204 });
  return Response.json({ version: offer.version, sha256: offer.sha256, signature: offer.signature, size: offer.size });
}
