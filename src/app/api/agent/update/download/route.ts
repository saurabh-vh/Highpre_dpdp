import { readFile } from "fs/promises";
import { join } from "path";
import { isDesktopPlatform } from "@/lib/agent/catalog";
import { deviceFromRequest } from "@/lib/agent/ingest";
import { agentDistDir } from "@/lib/agent/package";
import { updateOffer } from "@/lib/agent/update";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** The signed binary offered by /api/agent/update. No per-device configuration: that stays on the computer. */
export async function GET(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return Response.json({ error: "Unknown or removed device" }, { status: 401 });
  if (!(await rateLimit(`agent-update:${device._id}`, 6, 24 * 60 * 60_000)).allowed) return Response.json({ error: "Slow down" }, { status: 429 });
  const platform = new URL(req.url).searchParams.get("platform") ?? "";
  if (!isDesktopPlatform(platform)) return Response.json({ error: "Unknown platform" }, { status: 400 });
  const offer = await updateOffer(platform, "0");
  if (!offer) return new Response(null, { status: 404 });
  const body = await readFile(join(agentDistDir(), offer.file));
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": "application/octet-stream", "Content-Length": String(body.length), "Cache-Control": "no-store" },
  });
}
