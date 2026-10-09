import { readFile } from "fs/promises";
import { join } from "path";
import { isSiteKey } from "@/lib/privacy-centre/badge";
import { bootConsentMode } from "@/lib/consent/site-script";
import { connectDb } from "@/lib/db";
import { log } from "@/lib/log";
import { Site } from "@/models";

export const dynamic = "force-dynamic";

/**
 * The one script customers paste: /s/<siteKey>.js. It is widget.js with the
 * site key and the site's consent-signal settings embedded, so a single plain
 * <script> tag (no attributes, no extra snippets) runs the banner, form
 * checkboxes, badge and Google / Meta consent signals, all controlled from the
 * dashboard. Cached briefly so dashboard changes reach websites within minutes.
 */

const CACHE_MS = 60_000;
let widgetSource: string | null = null;
const boots = new Map<string, { at: number; js: string }>();

async function widget(): Promise<string> {
  // Built into public/ by `npm run build:widget`; the Docker image ships public/.
  widgetSource ??= await readFile(join(process.cwd(), "public", "widget.js"), "utf8");
  return widgetSource;
}

const HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const siteKey = file.endsWith(".js") ? file.slice(0, -3) : "";
  if (!isSiteKey(siteKey)) {
    return new Response('console.warn("[HighPre] Unknown site script.");', { status: 404, headers: HEADERS });
  }

  const cached = boots.get(siteKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return new Response(cached.js, { headers: HEADERS });

  try {
    await connectDb();
    const site = await Site.findOne({ siteKey }).select("siteKey purposes banner").lean();
    if (!site) return new Response('console.warn("[HighPre] Unknown site: check the script address in your HighPre dashboard.");', { status: 404, headers: HEADERS });
    const boot = { siteKey, cm: bootConsentMode(site) };
    // JSON in a script: escape "<" so the data can never close the tag.
    const js = `window.__HP_BOOT=${JSON.stringify(boot).replace(/</g, "\\u003c")};\n${await widget()}`;
    boots.set(siteKey, { at: Date.now(), js });
    if (boots.size > 5000) boots.delete(boots.keys().next().value!);
    return new Response(js, { headers: HEADERS });
  } catch (error) {
    log.error("site_script.failed", { siteKey, error: String(error) });
    // Still serve the widget: it reads its settings from the config API.
    return new Response(`window.__HP_BOOT=${JSON.stringify({ siteKey })};\n${await widget().catch(() => "")}`, { headers: { ...HEADERS, "Cache-Control": "no-store" } });
  }
}
