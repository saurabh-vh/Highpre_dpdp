import { cn } from "@/lib/utils";

/** Accessible on/off switch backed by a checkbox (submits "on" when checked). */
export function Switch({ name, label, description, defaultChecked, disabled }: { name: string; label: string; description?: string; defaultChecked?: boolean; disabled?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start justify-between gap-6", disabled && "cursor-not-allowed opacity-60")}>
      <span>
        <span className="block text-sm">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-mist">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" name={name} defaultChecked={defaultChecked} disabled={disabled} className="peer sr-only" />
        <span className="h-7 w-12 rounded-full bg-white/15 transition-colors duration-300 ease-apple peer-checked:bg-paper peer-focus-visible:ring-2 peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black" />
        <span className="absolute left-1 top-1 size-5 rounded-full bg-paper shadow transition-all duration-300 ease-apple peer-checked:translate-x-5 peer-checked:bg-ink" />
      </span>
    </label>
  );
}
