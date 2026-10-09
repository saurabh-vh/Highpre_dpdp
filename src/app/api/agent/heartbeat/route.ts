import { isDesktopPlatform } from "@/lib/agent/catalog";
import { deviceFromRequest, heartbeatSchema } from "@/lib/agent/ingest";
import { devicePolicy, getAgentPolicy } from "@/lib/agent/policy";
import { agentManifest } from "@/lib/agent/update";
import { rateLimit } from "@/lib/rate-limit";
import { AgentDevice } from "@/models";

export const dynamic = "force-dynamic";

/**
 * The agent checks in at start-up and every 15 minutes. 401 tells it the
 * device was removed. The reply carries the organisation's policy and, for
 * desktop agents with signed updates available, the latest version.
 */
export async function POST(req: Request) {
  const device = await deviceFromRequest(req);
  if (!device) return Response.json({ error: "Unknown or removed device" }, { status: 401 });
  if (!(await rateLimit(`agent-hb:${device._id}`, 30, 60 * 60_000)).allowed) return Response.json({ error: "Slow down" }, { status: 429 });

  const parsed = heartbeatSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid heartbeat" }, { status: 422 });
  const now = new Date();
  // $min sets firstSeenAt on the first heartbeat and leaves it alone afterwards.
  // Checking in again after a goodbye means it was reinstalled.
  await AgentDevice.updateOne({ _id: device._id }, { $set: { ...parsed.data, lastSeenAt: now }, $min: { firstSeenAt: now }, $unset: { uninstalledAt: 1 } });

  const [policy, manifest] = await Promise.all([getAgentPolicy(device.orgId), isDesktopPlatform(device.platform) ? agentManifest() : null]);
  return Response.json({
    ok: true,
    policy: devicePolicy(policy),
    ...(manifest?.updatesSigned ? { latestVersion: manifest.version } : {}),
  });
}
