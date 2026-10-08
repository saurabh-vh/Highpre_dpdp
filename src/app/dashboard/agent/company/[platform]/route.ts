import { AGENT_PLATFORMS, isDesktopPlatform } from "@/lib/agent/catalog";
import { buildCompanyDownload } from "@/lib/agent/package";
import { enrollKeyFor } from "@/lib/agent/policy";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { AgentPolicy } from "@/models";

export const dynamic = "force-dynamic";

/**
 * Company installer for MDM deployment (owners and admins). Downloading one
 * turns company enrolment on; computers it's installed on register themselves.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isDesktopPlatform(platform)) return new Response("Unknown platform", { status: 404 });
  const { org, user, role } = await requireAuth();
  if (!can(role, "team")) return new Response("Only owners and admins can download the company installer.", { status: 403 });
  if (!(await rateLimit(`agent-company:${user.id}`, 20, 60 * 60_000)).allowed) {
    return new Response("Too many downloads. Try again later.", { status: 429 });
  }

  const policy = await AgentPolicy.findOneAndUpdate(
    { orgId: org._id },
    { $set: { enrollmentEnabled: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  let file;
  try {
    file = await buildCompanyDownload(platform, { apiUrl: env().APP_URL, enrollKey: enrollKeyFor(org._id, policy!.enrollKeyVersion), orgName: org.name });
  } catch (error) {
    log.error("agent.download_unavailable", { platform, error: String(error) });
    return new Response("The desktop agent isn't available on this server yet. Ask your administrator to run `npm run build:agent`.", { status: 503 });
  }
  await audit(org._id, user, "agent.company_installer", `Downloaded the company installer for ${AGENT_PLATFORMS[platform].label}`);

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.body.length),
      "Cache-Control": "no-store",
    },
  });
}
