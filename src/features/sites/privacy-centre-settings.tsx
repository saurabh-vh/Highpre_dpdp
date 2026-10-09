"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { BADGE_LABEL, badgeDimensions, type BadgeSize, type BadgeTheme } from "@/lib/privacy-centre/badge";
import { cn } from "@/lib/utils";
import { savePrivacyCentreAction } from "./privacy-centre-actions";

export function PrivacyCentreForm({ siteId, enabled, showVendors, readOnly }: { siteId: string; enabled: boolean; showVendors: boolean; readOnly: boolean }) {
  const { state, pending, formProps } = useActionForm(savePrivacyCentreAction.bind(null, siteId));
  return (
    <form {...formProps} className="space-y-5">
      <Switch
        name="enabled"
        label="Publish privacy centre"
        description="One public page with your notice, data request link, grievance contact and the trackers HighPre found on your website."
        defaultChecked={enabled}
        disabled={readOnly}
      />
      <Switch
        name="showVendors"
        label="Show vendors on privacy centre"
        description="Lists active vendors from your vendor register with their category and processing country. Check the register is accurate first."
        defaultChecked={showVendors}
        disabled={readOnly}
      />
      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          <FormMessage state={state} className="mr-auto" />
          <SubmitButton pending={pending} pendingLabel="Saving">Save</SubmitButton>
        </div>
      )}
    </form>
  );
}

function Option<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-[20px] border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn("rounded-full px-3.5 py-1 text-xs font-medium transition-colors", value === o.id ? "bg-paper text-ink" : "text-fog hover:text-paper")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Privacy centre link, preview, and the embeddable badge with its HTML snippet. */
export function PrivacyCentreLinks({ url, badgeUrl, live }: { url: string; badgeUrl: string; live: boolean }) {
  const [theme, setTheme] = useState<BadgeTheme>("light");
  const [size, setSize] = useState<BadgeSize>("regular");
  const params = [theme === "dark" ? "theme=dark" : "", size === "small" ? "size=small" : ""].filter(Boolean).join("&");
  const src = params ? `${badgeUrl}?${params}` : badgeUrl;
  const { width, height } = badgeDimensions(size);
  const snippet = `<a href="${url}" target="_blank" rel="noopener"><img src="${src}" alt="${BADGE_LABEL}" width="${width}" height="${height}"></a>`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-fog">Privacy centre address</p>
        <div className="mt-2 flex flex-col gap-3 rounded-field bg-black/50 p-4 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-fog">{url}</code>
          <div className="flex shrink-0 gap-2">
            <CopyButton value={url} label="Copy link" />
            {live && (
              <a href={url} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium text-fog transition-colors hover:bg-white/5 hover:text-paper">
                Preview
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            )}
          </div>
        </div>
        <p className="mt-2 text-2xs text-mist">Link it from your website footer next to your privacy notice.</p>
      </div>

      <div>
        <p className="text-xs font-medium text-fog">Badge</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Option label="Badge colour" value={theme} onChange={setTheme} options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} />
          <Option label="Badge size" value={size} onChange={setSize} options={[{ id: "regular", label: "Regular" }, { id: "small", label: "Small" }]} />
        </div>
        <div className={cn("mt-4 flex items-center justify-center rounded-field border border-line p-6", theme === "light" ? "bg-[#f5f5f7]" : "bg-black")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the exact SVG customers embed */}
          <img src={src} alt={BADGE_LABEL} width={width} height={height} />
        </div>
        <div className="mt-3 flex flex-col gap-3 rounded-field bg-black/50 p-4 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-fog">{snippet}</code>
          <CopyButton value={snippet} label="Copy HTML" />
        </div>
        <p className="mt-2 text-2xs text-mist">The badge links visitors to your privacy centre. It doesn&apos;t claim certification or compliance.</p>
      </div>
    </div>
  );
}
