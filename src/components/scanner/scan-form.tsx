"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

/** Website address input that starts a free scan. */
export function ScanForm({ size = "lg", className, autoFocus }: { size?: "md" | "lg"; className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!/\.[a-z]{2,}/i.test(value)) {
      setError("Enter a website address, like yourbusiness.in");
      return;
    }
    router.push(`/scan?url=${encodeURIComponent(value)}`);
  }

  const lg = size === "lg";
  return (
    <form onSubmit={onSubmit} className={cn("w-full", className)} noValidate>
      <div
        className={cn(
          "glass-strong flex items-center gap-2 rounded-full p-1.5 transition-shadow duration-500 ease-apple focus-within:ring-4 focus-within:ring-white/10",
          lg ? "max-w-xl" : "max-w-md",
        )}
      >
        <label htmlFor="scan-url" className="sr-only">
          Website address
        </label>
        <input
          id="scan-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="yourbusiness.in"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setError(null);
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "scan-url-error" : undefined}
          className={cn("min-w-0 flex-1 bg-transparent pl-5 text-paper placeholder:text-mist focus:outline-none", lg ? "h-12 text-base" : "h-10 text-sm")}
        />
        <button
          type="submit"
          className={cn(
            "shrink-0 rounded-full bg-paper font-medium text-ink transition-[transform,background-color] duration-300 ease-apple hover:bg-fog active:scale-[0.97]",
            lg ? "h-12 px-6 text-sm" : "h-10 px-5 text-xs",
          )}
        >
          Scan free
        </button>
      </div>
      {error && (
        <p id="scan-url-error" role="alert" className="mt-3 pl-5 text-xs text-paper">
          {error}
        </p>
      )}
    </form>
  );
}
