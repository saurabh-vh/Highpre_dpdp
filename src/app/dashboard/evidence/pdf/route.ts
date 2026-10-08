import { audit } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/guards";
import { buildEvidencePack } from "@/lib/evidence/pack";
import { log } from "@/lib/log";
import { rateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

function parseDay(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Interpret dates in IST, the timezone of the business.
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+05:30`);
}

/** Streams the PDF evidence pack for the chosen period (default: the last 12 months). */
export async function GET(req: Request) {
  const { org, user, plan } = await requireAuth();
  if (!plan.features.evidencePack) return new Response("The evidence pack is available on paid plans.", { status: 402 });
  if (!(await rateLimit(`evidence:${org.id}`, 10, 60 * 60_000)).allowed) return new Response("Too many downloads. Try again later.", { status: 429 });

  const url = new URL(req.url);
  const to = parseDay(url.searchParams.get("to"), true) ?? new Date();
  const from = parseDay(url.searchParams.get("from"), false) ?? new Date(to.getTime() - 365 * 86_400_000);
  if (from > to) return new Response("The start date must be before the end date.", { status: 400 });

  try {
    const bytes = await buildEvidencePack(org, user.name, { from, to });
    await audit(org._id, user, "export.evidence", `Downloaded the evidence pack for ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`);
    const name = `highpre-evidence-${org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    log.error("evidence.failed", { orgId: org.id, error: String(error) });
    return new Response("We couldn't build the evidence pack. Try again in a minute.", { status: 500 });
  }
}
