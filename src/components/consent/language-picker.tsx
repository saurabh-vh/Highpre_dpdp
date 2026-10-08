"use client";

import { nativeName } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";

/** Language switcher for public pages. Pills when there are a few, a select when there are many. */
export function LanguagePicker({ languages, value, onChange }: { languages: string[]; value: string; onChange: (lang: string) => void }) {
  if (languages.length < 2) return null;
  if (languages.length > 4) {
    return (
      <label className="mb-12 inline-flex items-center gap-2 text-xs text-mist">
        <span>Language</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 rounded-full border border-white/15 bg-black/40 px-3 text-xs text-paper focus:border-white/60 focus:outline-none"
        >
          {languages.map((l) => (
            <option key={l} value={l} lang={l}>
              {nativeName(l)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div role="group" aria-label="Language" className="mb-12 inline-flex flex-wrap gap-1 rounded-[20px] border border-white/10 bg-white/[0.04] p-1">
      {languages.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={value === l}
          onClick={() => onChange(l)}
          className={cn("rounded-full px-4 py-1.5 text-xs font-medium transition-colors", value === l ? "bg-paper text-ink" : "text-fog hover:text-paper")}
        >
          {nativeName(l)}
        </button>
      ))}
    </div>
  );
}
