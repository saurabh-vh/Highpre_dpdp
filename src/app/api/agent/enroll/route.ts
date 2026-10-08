import { enrollSchema } from "@/lib/agent/ingest";
import { getAgentPolicy, parseEnrollKey } from "@/lib/agent/policy";
import { randomToken, sha256 } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { clientIp } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { AgentDevice, AgentPolicy, Organization } from "@/models";

export const dynamic = "force-dynamic";

/**
 * A company installer (deployed with Intune, Jamf and similar) registers this
 * computer and receives its own device token. Reinstalling on the same
 * computer and account reuses the device. A computer the organisation removed
 * gets 410 and stays off, until the enrolment key is rotated.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`agent-enroll-ip:${ip}`, 30, 60 * 60_000)).allowed) return Response.json({ error: "Slow down" }, { status: 429 });

  const parsed = enrollSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid enrolment" }, { status: 422 });
  const { enrollKey, ...info } = parsed.data;
  const key = parseEnrollKey(enrollKey);
  if (!key) return Response.json({ error: "Invalid enrolment key" }, { status: 403 });

  await connectDb();
  const [org, policy, policyDoc] = await Promise.all([
    Organization.exists({ _id: key.orgId }),
    getAgentPolicy(key.orgId),
    AgentPolicy.findOne({ orgId: key.orgId }).select("enrollKeyRotatedAt").lean(),
  ]);
  if (!org || !policy.enrollmentEnabled || policy.enrollKeyVersion !== key.version) {
    return Response.json({ error: "Company installs are turned off for this organisation" }, { status: 403 });
  }
  if (!(await rateLimit(`agent-enroll-org:${key.orgId}`, 500, 60 * 60_000)).allowed) return Response.json({ error: "Slow down" }, { status: 429 });

  const same = { orgId: key.orgId, enrolled: true, hostname: info.hostname, osUser: info.osUser };
  const removed = await AgentDevice.exists({
    ...same,
    revokedAt: { $exists: true, ...(policyDoc?.enrollKeyRotatedAt ? { $gt: policyDoc.enrollKeyRotatedAt } : {}) },
  });
  if (removed) return Response.json({ error: "This computer was removed by your organisation" }, { status: 410 });

  const token = `hpa_${randomToken(32)}`;
  const now = new Date();
  await AgentDevice.findOneAndUpdate(
    { ...same, revokedAt: { $exists: false } },
    {
      $set: { tokenHash: sha256(token), platform: info.platform, osVersion: info.osVersion, agentVersion: info.agentVersion, lastSeenAt: now },
      $setOnInsert: { firstSeenAt: now },
    },
    { upsert: true },
  );
  return Response.json({ token });
}
