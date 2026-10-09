// The slim build skips cheerio's network helpers; pages are fetched by our own SSRF-safe client.
import * as cheerio from "cheerio/slim";
import { contrast, ensureContrast, readableOn, rgbToHex, saturationLightness, type Rgb } from "@/lib/color";
import { safeFontFamily } from "@/lib/banner-layout";
import { safeFetchPage, safeFetchText } from "./safe-fetch";

/** Colours and font that make the consent banner look like part of the website. */
export type Brand = {
  /** Likely brand colour (buttons, links), if one stands out. */
  primary?: string;
  /** Button text on `primary`: black or white, at least 4.5:1. */
  onPrimary?: string;
  background: string;
  /** Body text, adjusted to reach 4.5:1 on `background`. */
  text: string;
  /** The site's own font-family list (never loaded by us), if found. */
  font?: string;
};

const MAX_STYLESHEETS = 2;
const MAX_CSS_BYTES = 400_000;

// ── Colour parsing ────────────────────────────────────────────────────

function hslToRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function alphaOf(raw: string | undefined): number {
  if (!raw) return 1;
  return raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw);
}

/** The first opaque colour in a CSS value, as #rrggbb. Mostly-transparent colours are ignored. */
export function parseColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  const hex = v.match(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/);
  if (hex) {
    let h = hex[1];
    if (h.length <= 4) h = h.replace(/./g, (c) => c + c);
    if (h.length === 8 && parseInt(h.slice(6), 16) / 255 < 0.5) return null;
    return "#" + h.slice(0, 6);
  }
  const rgb = v.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/);
  if (rgb) return alphaOf(rgb[4]) < 0.5 ? null : rgbToHex([+rgb[1], +rgb[2], +rgb[3]]);
  // hsl(), and bare "H S% L%" channels as used by Tailwind/shadcn custom properties.
  const hsl = v.match(/(?:hsla?\(\s*)?([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?/);
  if (hsl && (v.startsWith("hsl") || /^[\d.]+(deg)?[\s,]+[\d.]+%[\s,]+[\d.]+%/.test(v))) {
    return alphaOf(hsl[4]) < 0.5 ? null : rgbToHex(hslToRgb(+hsl[1], +hsl[2] / 100, +hsl[3] / 100));
  }
  if (/^(white)\b/.test(v)) return "#ffffff";
  if (/^(black)\b/.test(v)) return "#000000";
  return null;
}

/** Saturated, mid-lightness colours: greys, near-white and near-black aren't brand colours. */
export function isBrandish(hex: string): boolean {
  const [s, l] = saturationLightness(hex);
  return s >= 0.25 && l >= 0.12 && l <= 0.88;
}

// ── CSS scanning ──────────────────────────────────────────────────────

type Rule = { selector: string; decls: [string, string][] };

function parseRules(css: string): Rule[] {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const decls: [string, string][] = [];
    for (const part of m[2].split(";")) {
      const i = part.indexOf(":");
      if (i > 0) decls.push([part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).replace(/!important/i, "").trim()]);
    }
    rules.push({ selector: m[1].trim().replace(/^@[^{]*$/, ""), decls });
  }
  return rules;
}

const ROOTISH = /^(html|body|:root)$/;
const BUTTONISH = /(^|[\s,>+~])button\b|\.btn\b|\.button\b|\[type=["']?submit|\.cta\b|-btn\b/i;
const COLOR_PROPS = /^(color|background|background-color|border-color|fill|stroke|outline-color)$/;

function isRootSelector(selector: string): boolean {
  return selector.split(",").some((s) => ROOTISH.test(s.trim()));
}

/** Resolves var(--x) one level deep (two for chains like --primary: var(--blue-600)). */
function resolveVars(value: string, vars: Map<string, string>, depth = 0): string {
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name: string, fallback?: string) => {
    const found = vars.get(name.toLowerCase());
    if (found !== undefined) return depth < 2 ? resolveVars(found, vars, depth + 1) : found;
    return fallback ?? "";
  });
}

/**
 * Picks the likely brand colour, page background, text colour and font from a
 * page's HTML (meta theme-color, inline styles), its stylesheets and web
 * manifest. Pure: the caller fetches the CSS and manifest.
 */
export function extractBrand(input: { html: string; css?: string[]; manifest?: string | null }): Brand {
  const $ = cheerio.load(input.html);
  const inline = $("style").map((_, el) => $(el).html() ?? "").get();
  const rules = [...inline, ...(input.css ?? [])].flatMap(parseRules);

  // Custom properties first, so var() references resolve.
  const vars = new Map<string, string>();
  for (const r of rules) for (const [p, v] of r.decls) if (p.startsWith("--") && !vars.has(p)) vars.set(p, v);

  const scores = new Map<string, number>();
  const frequency = new Map<string, number>();
  const vote = (raw: string | undefined | null, weight: number) => {
    if (!raw) return;
    const hex = parseColor(resolveVars(raw, vars));
    if (hex && isBrandish(hex)) scores.set(hex, (scores.get(hex) ?? 0) + weight);
  };

  vote($('meta[name="theme-color"]').first().attr("content"), 10);
  if (input.manifest) {
    try {
      const m = JSON.parse(input.manifest) as { theme_color?: unknown };
      if (typeof m.theme_color === "string") vote(m.theme_color, 8);
    } catch {
      /* not JSON: ignore */
    }
  }
  for (const [name, value] of vars) {
    if (/^--(color-|clr-|theme-|bs-)?(primary|brand)(-color|-500|-600)?$/.test(name)) vote(value, 9);
    else if (/^--(color-|clr-|bs-)?(accent|secondary|main|theme)(-color)?$/.test(name)) vote(value, 4);
  }

  let background: string | null = null;
  let text: string | null = null;
  let font = "";
  for (const r of rules) {
    const buttonish = BUTTONISH.test(r.selector);
    const root = isRootSelector(r.selector);
    for (const [p, raw] of r.decls) {
      const value = resolveVars(raw, vars);
      if (buttonish && (p === "background" || p === "background-color")) vote(value, 4);
      if (COLOR_PROPS.test(p)) {
        const hex = parseColor(value);
        if (hex && isBrandish(hex)) frequency.set(hex, (frequency.get(hex) ?? 0) + 1);
      }
      if (root) {
        if (!background && (p === "background" || p === "background-color")) background = parseColor(value);
        if (!text && p === "color") text = parseColor(value);
        if (!font && p === "font-family") font = safeFontFamily(value);
      }
    }
  }
  // Inline styles on buttons count like button rules.
  $("button[style], a[class*=btn][style], a[class*=button][style], input[type=submit][style]").each((_, el) => {
    const m = ($(el).attr("style") ?? "").match(/background(?:-color)?\s*:\s*([^;]+)/i);
    if (m) vote(m[1], 4);
  });
  // How often a colour appears: a tie-breaker that can't outvote explicit signals.
  for (const [hex, n] of frequency) scores.set(hex, (scores.get(hex) ?? 0) + Math.min(6, n * 0.5));

  background ??= parseColor(resolveVars(vars.get("--background") ?? vars.get("--bg") ?? vars.get("--color-background") ?? "", vars)) ?? "#ffffff";
  text ??= parseColor(resolveVars(vars.get("--foreground") ?? vars.get("--text") ?? vars.get("--color-text") ?? "", vars));
  if (!font) font = safeFontFamily(resolveVars(vars.get("--font-sans") ?? vars.get("--font-family") ?? vars.get("--font-body") ?? "", vars));

  const primary = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const bg = background;
  const brand: Brand = {
    background: bg,
    text: ensureContrast(text ?? (contrast("#111111", bg) >= contrast("#ffffff", bg) ? "#111111" : "#ffffff"), bg, 4.5),
  };
  if (primary) {
    brand.primary = primary;
    brand.onPrimary = readableOn(primary);
  }
  if (font) brand.font = font;
  return brand;
}

/** Same site: the page's host or one of its subdomains (www. ignored). */
function sameSite(url: URL, page: URL): boolean {
  const base = page.hostname.replace(/^www\./, "");
  return url.hostname === base || url.hostname.endsWith("." + base);
}

/** The first same-site stylesheets and the web manifest a page links to. */
export function brandSources(html: string, pageUrl: string): { stylesheets: string[]; manifest?: string } {
  const $ = cheerio.load(html);
  const page = new URL(pageUrl);
  const resolve = (href: string | undefined) => {
    if (!href) return null;
    try {
      const u = new URL(href, page);
      return /^https?:$/.test(u.protocol) && sameSite(u, page) ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const stylesheets = $('link[rel~="stylesheet"][href]')
    .map((_, el) => resolve($(el).attr("href")))
    .get()
    .filter((u): u is string => Boolean(u))
    .slice(0, MAX_STYLESHEETS);
  const manifest = resolve($('link[rel="manifest"][href]').first().attr("href")) ?? undefined;
  return { stylesheets, manifest };
}

/** Fetches a site's homepage, first stylesheets and manifest (SSRF-safe, size-capped) and extracts its brand. */
export async function fetchBrand(pageUrl: string): Promise<Brand> {
  const page = await safeFetchPage(pageUrl);
  const { stylesheets, manifest } = brandSources(page.html, page.url);
  const [css, manifestText] = await Promise.all([
    Promise.all(stylesheets.map((u) => safeFetchText(u, "text/css,*/*;q=0.1", MAX_CSS_BYTES))),
    manifest ? safeFetchText(manifest, "application/manifest+json,application/json", 50_000) : Promise.resolve(null),
  ]);
  return extractBrand({ html: page.html, css: css.filter((c): c is string => Boolean(c)), manifest: manifestText });
}
