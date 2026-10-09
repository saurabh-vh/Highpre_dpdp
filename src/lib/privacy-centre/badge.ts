/**
 * The "Privacy centre by HighPre" badge customers can embed on their website.
 * It links visitors to the privacy centre; it is not a certification and
 * must never say so.
 */

export type BadgeTheme = "light" | "dark";
export type BadgeSize = "regular" | "small";

export const BADGE_LABEL = "Privacy centre by HighPre";
const SITE_KEY = /^[A-Za-z0-9_-]{8,40}$/;

export const isSiteKey = (value: unknown): value is string => typeof value === "string" && SITE_KEY.test(value);

export function parseBadgeOptions(params: URLSearchParams): { theme: BadgeTheme; size: BadgeSize } {
  return {
    theme: params.get("theme") === "dark" ? "dark" : "light",
    size: params.get("size") === "small" ? "small" : "regular",
  };
}

const THEMES = {
  light: { bg: "#FFFFFF", border: "#D2D2D7", text: "#1D1D1F", muted: "#6E6E73", icon: "#1D1D1F" },
  dark: { bg: "#000000", border: "#3A3A3C", text: "#F5F5F7", muted: "#A1A1A6", icon: "#F5F5F7" },
} as const;

const SIZES = {
  regular: { width: 196, height: 40 },
  small: { width: 147, height: 30 },
} as const;

export const badgeDimensions = (size: BadgeSize) => ({ width: SIZES[size].width, height: SIZES[size].height });

/** A self-contained SVG (no scripts, fonts or external references), safe to serve cross-origin. */
export function badgeSvg({ theme = "light", size = "regular" }: { theme?: BadgeTheme; size?: BadgeSize } = {}): string {
  const c = THEMES[theme];
  const { width, height } = SIZES[size];
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 196 40" role="img" aria-label="${BADGE_LABEL}">
<title>${BADGE_LABEL}</title>
<rect x="0.5" y="0.5" width="195" height="39" rx="19.5" fill="${c.bg}" stroke="${c.border}"/>
<g transform="translate(14 9)" fill="none" stroke="${c.icon}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<path d="M11 1.5 3 4.5v6.2c0 4.9 3.4 8.6 8 9.8 4.6-1.2 8-4.9 8-9.8V4.5L11 1.5Z"/>
<path d="m7.6 11 2.4 2.4 4.6-4.8"/>
</g>
<text x="44" y="18" font-family="${font}" font-size="12" font-weight="600" fill="${c.text}">Privacy centre</text>
<text x="44" y="31" font-family="${font}" font-size="10" fill="${c.muted}">by HighPre</text>
</svg>`.replace(/\n/g, "");
}

/** Cached for an hour and embeddable from any origin (CORS for fetch, CORP for <img>). */
export const BADGE_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "X-Content-Type-Options": "nosniff",
} as const;
