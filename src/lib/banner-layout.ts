/** Banner layouts offered to customers. widget.js renders each one. */
export const BANNER_LAYOUTS = ["bar", "popup", "box"] as const;
export type BannerLayout = (typeof BANNER_LAYOUTS)[number];

/**
 * The banner's layout. Banners saved before layouts existed have no layout:
 * a full-width position becomes the bar, a corner position the box, so
 * existing customers see no change.
 */
export function bannerLayout(banner: { layout?: string | null; position?: string | null }): BannerLayout {
  if ((BANNER_LAYOUTS as readonly unknown[]).includes(banner.layout)) return banner.layout as BannerLayout;
  return banner.position === "bottom" ? "bar" : "box";
}

/** Font stack used when the customer hasn't chosen their website's font. No web fonts are ever loaded. */
export const SYSTEM_FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans','Noto Sans Devanagari','Noto Sans Bengali','Noto Sans Tamil','Noto Sans Telugu','Noto Sans Gujarati','Noto Sans Kannada',sans-serif";

/** A font-family list made only of names (no url(), var() or other CSS), or "" when unsafe. */
export function safeFontFamily(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim().replace(/\s+/g, " ");
  if (!v || v.length > 200 || !/^[A-Za-z0-9 ,'"_-]+$/.test(v)) return "";
  return v;
}
