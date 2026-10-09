import { deviceFromRequest } from "@/lib/agent/ingest";
import { ingestUsage, usageSchema } from "@/lib/agent/usage";
import { rateLimit } from "@/lib/rate-limit";
import { AgentDevice } from "@/models";

export const dynamic = "force-dynamic";

/**
 * Receives, about once a day, which AI tools a device opened on which days:
 * `{days: [{day: "2026-10-08", apps: ["chatgpt"]}]}`. Nothing else is
 * accepted. Ignored when the organisation has turned sharing off.
 */
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return Response.json({ error: "Unknown or removed device" }, { status: 401 });
  if (!(await rateLimit(`agent-usage:${device._id}`, 24, 24 * 60 * 60_000)).allowed) return Response.json({ error: "Slow down" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > 8_000) return Response.json({ error: "Too large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = usageSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid usage report" }, { status: 422 });

  const result = await ingestUsage(device, parsed.data.days);
  await AgentDevice.updateOne({ _id: device._id }, { lastSeenAt: new Date() });
  return Response.json({ ok: true, ...result });
}
