import type { CSSProperties } from "react";
import { SYSTEM_FONT_STACK, type BannerLayout } from "@/lib/banner-layout";
import { isHex, readableOn, withAlpha } from "@/lib/color";
import { cn } from "@/lib/utils";

type PreviewPurpose = { key: string; name: string; essential: boolean };

export type BannerColors = { primaryColor?: string; backgroundColor?: string; textColor?: string; fontFamily?: string };

/** Inline styles for custom colours, computed exactly as widget.js does. Null when the theme's defaults apply. */
function customStyles(theme: "dark" | "light", c: BannerColors) {
  const custom = isHex(c.primaryColor) || isHex(c.backgroundColor) || isHex(c.textColor) || Boolean(c.fontFamily);
  if (!custom) return null;
  const dark = theme === "dark";
  const fg = isHex(c.textColor) ? c.textColor : dark ? "#ffffff" : "#000000";
  const accent = isHex(c.primaryColor) ? c.primaryColor : fg;
  return {
    card: {
      color: fg,
      ...(isHex(c.backgroundColor) ? { background: c.backgroundColor } : {}),
      fontFamily: c.fontFamily ? `${c.fontFamily},${SYSTEM_FONT_STACK}` : undefined,
    } as CSSProperties,
    muted: { color: withAlpha(fg, isHex(c.textColor) ? 0.72 : dark ? 0.64 : 0.6) } as CSSProperties,
    line: { borderColor: withAlpha(fg, 0.25) } as CSSProperties,
    solid: { background: accent, color: isHex(c.primaryColor) ? readableOn(c.primaryColor) : dark ? "#000" : "#fff" } as CSSProperties,
  };
}

/**
 * Static React rendering of the consent banner, mirroring widget/src/widget.js.
 * Used for the dashboard preview and the landing page illustration. The bar
 * is shown as on a phone (on wide screens the widget puts the buttons beside the text).
 */
export function BannerPreview({
  title,
  message,
  theme = "dark",
  purposes,
  layout = "box",
  colors = {},
  className,
}: {
  title: string;
  message: string;
  theme?: "dark" | "light";
  purposes?: PreviewPurpose[];
  layout?: BannerLayout;
  colors?: BannerColors;
  className?: string;
}) {
  const dark = theme === "dark";
  const s = customStyles(theme, colors);
  const bar = layout === "bar";
  return (
    <div
      role="img"
      aria-label={`Preview of the ${layout} consent banner`}
      style={s?.card}
      className={cn(
        "w-full rounded-[22px] p-5 text-left shadow-2xl",
        bar ? "max-w-none" : layout === "popup" ? "max-w-[440px]" : "max-w-sm",
        dark ? "border border-white/15 bg-black/70 text-white backdrop-blur-2xl" : "bg-white/90 text-black backdrop-blur-2xl",
        className,
      )}
    >
      <div>
        <div>
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <p style={s?.muted} className={cn("mt-1.5 text-xs leading-relaxed", dark ? "text-white/65" : "text-black/60")}>{message}</p>
          {!bar && purposes && purposes.length > 0 && (
            <ul style={s?.line} className={cn("mt-4 divide-y rounded-2xl border text-xs", dark ? "divide-white/10 border-white/10" : "divide-black/10 border-black/10")}>
              {purposes.slice(0, 4).map((p) => (
                <li key={p.key} style={s?.line} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="truncate">{p.name}</span>
                  <span
                    style={!p.essential && s ? { background: s.solid.background } : undefined}
                    className={cn(
                      "relative h-5 w-9 shrink-0 rounded-full",
                      p.essential ? (dark ? "bg-white/50" : "bg-black/40") : dark ? "bg-white" : "bg-black",
                    )}
                  >
                    <span style={!p.essential && s ? { background: s.solid.color } : undefined} className={cn("absolute right-0.5 top-0.5 size-4 rounded-full", dark ? "bg-black" : "bg-white")} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <span style={s?.line} className={cn("grid h-9 place-items-center rounded-full border text-xs font-medium", dark ? "border-white/25" : "border-black/20")}>Reject all</span>
          <span style={s?.line} className={cn("grid h-9 place-items-center rounded-full border text-xs font-medium", dark ? "border-white/25" : "border-black/20")}>Accept all</span>
          <span style={s?.solid} className={cn("col-span-2 grid h-9 place-items-center rounded-full text-xs font-medium", dark ? "bg-white text-black" : "bg-black text-white")}>
            Choose purposes
          </span>
        </div>
      </div>
      <p style={s?.muted} className={cn("mt-3 flex gap-4 text-2xs", bar ? "justify-start" : "justify-center", dark ? "text-white/50" : "text-black/50")}>
        <span>Read notice</span>
        <span>Your data requests</span>
        <span lang="hi">हिंदी</span>
      </p>
    </div>
  );
}
