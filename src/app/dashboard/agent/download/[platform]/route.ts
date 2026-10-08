import { buildExtensionDownload } from "@/lib/agent/extension";
import { buildAgentDownload } from "@/lib/agent/package";
import { AGENT_PLATFORMS, isAgentPlatform } from "@/lib/agent/catalog";
import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/guards";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";
import { AgentDevice } from "@/models";

export const dynamic = "force-dynamic";

/**
 * Downloads the desktop agent or browser extension linked to the signed-in
 * member. Every download is a separate device with its own token; only the
 * token's hash is stored.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  if (!isAgentPlatform(platform)) return new Response("Unknown platform", { status: 404 });
  const { org, user } = await requireAuth();
  if (!(await rateLimit(`agent-download:${user.id}`, 20, 60 * 60_000)).allowed) {
    return new Response("Too many downloads. Try again later.", { status: 429 });
  }

  const token = `hpa_${randomToken(32)}`;
  const config = { apiUrl: env().APP_URL, token, orgName: org.name, userName: user.name };
  let file;
  try {
    file = platform === "browser" ? await buildExtensionDownload(config) : await buildAgentDownload(platform, config);
  } catch (error) {
    log.error("agent.download_unavailable", { platform, error: String(error) });
    return new Response("The desktop agent isn't available on this server yet. Ask your administrator to run `npm run build:agent`.", { status: 503 });
  }

  await AgentDevice.create({ orgId: org._id, userId: user.id, tokenHash: sha256(token), platform });
  await audit(org._id, user, "agent.downloaded", `Downloaded the HighPre ${platform === "browser" ? "browser extension" : `desktop agent for ${AGENT_PLATFORMS[platform].label}`}`);

  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.body.length),
      "Cache-Control": "no-store",
    },
  });
}
