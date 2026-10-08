import { cn } from "@/lib/utils";

type PreviewPurpose = { key: string; name: string; essential: boolean };

/**
 * Static React rendering of the consent banner, mirroring widget/src/widget.js.
 * Used for the dashboard preview and the landing page illustration.
 */
export function BannerPreview({
  title,
  message,
  theme = "dark",
  purposes,
  className,
}: {
  title: string;
  message: string;
  theme?: "dark" | "light";
  purposes?: PreviewPurpose[];
  className?: string;
}) {
  const dark = theme === "dark";
  return (
    <div
      className={cn(
        "w-full max-w-sm rounded-[22px] p-5 text-left shadow-2xl",
        dark ? "border border-white/15 bg-black/70 text-white backdrop-blur-2xl" : "bg-white/90 text-black backdrop-blur-2xl",
        className,
      )}
    >
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      <p className={cn("mt-1.5 text-xs leading-relaxed", dark ? "text-white/65" : "text-black/60")}>{message}</p>
      {purposes && purposes.length > 0 && (
        <ul className={cn("mt-4 divide-y rounded-2xl border text-xs", dark ? "divide-white/10 border-white/10" : "divide-black/10 border-black/10")}>
          {purposes.slice(0, 4).map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <span className="truncate">{p.name}</span>
              <span
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full",
                  p.essential ? (dark ? "bg-white/50" : "bg-black/40") : dark ? "bg-white" : "bg-black",
                )}
              >
                <span className={cn("absolute right-0.5 top-0.5 size-4 rounded-full", dark ? "bg-black" : "bg-white")} />
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <span className={cn("grid h-9 place-items-center rounded-full border text-xs font-medium", dark ? "border-white/25" : "border-black/20")}>Reject all</span>
        <span className={cn("grid h-9 place-items-center rounded-full border text-xs font-medium", dark ? "border-white/25" : "border-black/20")}>Accept all</span>
        <span className={cn("col-span-2 grid h-9 place-items-center rounded-full text-xs font-medium", dark ? "bg-white text-black" : "bg-black text-white")}>
          Choose purposes
        </span>
      </div>
      <p className={cn("mt-3 flex justify-center gap-4 text-2xs", dark ? "text-white/50" : "text-black/50")}>
        <span>Read notice</span>
        <span>Your data requests</span>
        <span lang="hi">हिंदी</span>
      </p>
    </div>
  );
}
