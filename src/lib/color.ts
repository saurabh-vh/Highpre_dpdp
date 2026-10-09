/**
 * Small colour helpers shared by the brand extractor, the banner settings and
 * widget.js (which bundles this file). Keep it dependency-free.
 */

export type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.replace(/./g, (c) => c + c);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(rgb: Rgb): string {
  return "#" + rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

/** `rgba(...)` for a hex colour at the given opacity. */
export function withAlpha(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + alpha + ")";
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  // Index access rather than destructuring: widget.js targets Safari 12.
  const c = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** White text when it reaches 4.5:1 on `bg`, otherwise black (which then always does). */
export function readableOn(bg: string): string {
  return contrast("#ffffff", bg) >= 4.5 ? "#ffffff" : "#000000";
}

/** Mixes `hex` toward `target` by `amount` (0 to 1). */
export function mix(hex: string, target: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
}

/** Darkens or lightens `fg` until it reaches `ratio` against `bg`. */
export function ensureContrast(fg: string, bg: string, ratio = 4.5): string {
  if (contrast(fg, bg) >= ratio) return fg;
  const target = luminance(bg) > 0.18 ? "#000000" : "#ffffff";
  for (let i = 1; i <= 10; i++) {
    const next = mix(fg, target, i / 10);
    if (contrast(next, bg) >= ratio) return next;
  }
  return readableOn(bg);
}

/** HSL saturation and lightness (0 to 1), used to tell brand colours from greys. */
export function saturationLightness(hex: string): [number, number] {
  const c = hexToRgb(hex).map((v) => v / 255);
  const r = c[0];
  const g = c[1];
  const b = c[2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, l];
  const d = max - min;
  return [l > 0.5 ? d / (2 - max - min) : d / (max + min), l];
}
