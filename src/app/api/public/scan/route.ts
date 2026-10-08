import { connectDb } from "@/lib/db";
import { json, limitOrNull } from "@/lib/http";
import { scanErrorMessage, scanWebsite } from "@/lib/scanner";
import { publicScanSchema } from "@/lib/validation";
import { Scan } from "@/models";

export const maxDuration = 60;

/** Free, anonymous scan from the landing page. Rate-limited per IP. */
export async function POST(req: Request) {
  const limited = await limitOrNull(req, "scan", 6, 10 * 60_000);
  if (limited) return limited;

  const parsed = publicScanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Enter a website address." }, { status: 422 });

  try {
    const result = await scanWebsite(parsed.data.url);
    await connectDb();
    await Scan.create({ status: "complete", ...result });
    return json(result);
  } catch (error) {
    return json({ error: scanErrorMessage(error) }, { status: 422 });
  }
}
