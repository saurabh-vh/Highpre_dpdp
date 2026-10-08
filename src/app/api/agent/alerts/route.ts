import { alertsSchema, deviceFromRequest, ingestAlerts } from "@/lib/agent/ingest";
import { rateLimit } from "@/lib/rate-limit";
import { AgentDevice } from "@/models";

export const dynamic = "force-dynamic";

/**
 * Receives detections from a desktop agent: data type, app and time only.
 * Any other field (such as copied text) makes the whole request invalid.
 */
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return Response.json({ error: "Unknown or removed device" }, { status: 401 });
  if (!(await rateLimit(`agent-alerts:${device._id}`, 60, 60 * 60_000)).allowed) return Response.json({ error: "Slow down" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 20_000) return Response.json({ error: "Too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = alertsSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid alerts" }, { status: 422 });

  const stored = await ingestAlerts(device, parsed.data.events);
  await AgentDevice.updateOne({ _id: device._id }, { lastSeenAt: new Date() });
  return Response.json({ ok: true, stored });
}
