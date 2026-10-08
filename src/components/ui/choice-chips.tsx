import { cn } from "@/lib/utils";

type Option = { value: string; label: string };

/**
 * Multi-select rendered as toggleable chips, backed by real checkboxes so it
 * works in plain HTML forms (values arrive via FormData.getAll(name)).
 */
export function ChoiceChips({ name, options, defaultValue = [], legend, error }: { name: string; options: readonly Option[]; defaultValue?: string[]; legend: string; error?: string }) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="mb-2.5 text-xs font-medium text-fog">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaultValue.includes(o.value)} className="peer sr-only" />
            <span
              className={cn(
                "inline-flex h-9 items-center rounded-full border border-white/15 px-3.5 text-xs text-fog transition-all duration-300 ease-apple",
                "hover:border-white/35 peer-checked:border-paper peer-checked:bg-paper peer-checked:text-ink",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-white peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-black",
              )}
            >
              {o.label}
            </span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-2xs font-medium text-danger">{error}</p>}
    </fieldset>
  );
}
