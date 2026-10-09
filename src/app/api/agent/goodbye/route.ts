import { deviceFromRequest } from "@/lib/agent/ingest";
import { markUninstalled } from "@/lib/agent/usage";
import { sha256 } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { AgentDevice } from "@/models";

export const dynamic = "force-dynamic";

/*
 * The person removed HighPre. Recorded so owners can see a gap in protection;
 * the device is never revoked here.
 *
 * - POST, with the device's bearer token: the desktop agent, as `--uninstall` runs.
 * - GET ?k=<uninstall key>: the browser opens this after the extension is
 *   removed (chrome.runtime.setUninstallURL). No sign-in; the page is the same
 *   whether or not the key matched.
 */

export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return Response.json({ error: "Unknown or removed device" }, { status: 401 });
  await markUninstalled(device._id);
  return Response.json({ ok: true });
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>HighPre removed</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f5f7;color:#1c1c1e;font:15px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:16px}
main{max-width:420px;background:#fff;border-radius:16px;padding:28px}h1{font-size:18px;margin:0 0 8px}p{margin:0;color:#636366}
@media (prefers-color-scheme:dark){body{background:#0b0b0d;color:#f4f4f5}main{background:#16161a}p{color:#a1a1aa}}</style>
</head><body><main><h1>HighPre has been removed from this browser.</h1><p>You can close this tab.</p></main></body></html>`;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("k") ?? "";
  if (/^hpu_[A-Za-z0-9_-]{20,100}$/.test(key) && (await rateLimit(`agent-goodbye:${clientIp(req)}`, 30, 60 * 60_000)).allowed) {
    await connectDb();
    const device = await AgentDevice.findOne({ uninstallKeyHash: sha256(key) }).select("_id").lean();
    if (device) await markUninstalled(device._id);
  }
  return new Response(PAGE, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
  });
}
