"use client";

import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { BadgeIllustration } from "@/components/illustrations/feature-illustrations";
import { CopyButton } from "@/components/ui/copy-button";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { BADGE_LABEL, badgeDimensions, type BadgeSize, type BadgeTheme } from "@/lib/privacy-centre/badge";
import { cn } from "@/lib/utils";
import { savePrivacyCentreAction } from "./privacy-centre-actions";

type Placement = "footer" | "corner";
type BadgeSettings = { enabled: boolean; placement: Placement; theme: BadgeTheme; size: BadgeSize };

function Option<T extends string>({ name, label, value, options, onChange, disabled }: { name: string; label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-[20px] border border-line bg-surface p-1">
      <input type="hidden" name={name} value={value} />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => onChange(o.id)}
          className={cn("rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors", value === o.id ? "bg-paper text-ink" : "text-fog hover:text-paper")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Privacy centre switches and the website badge. The badge is drawn by the
 * HighPre script already on the website, so there's nothing extra to paste.
 */
export function PrivacyCentreForm({
  siteId,
  enabled,
  showVendors,
  badge,
  badgeUrl,
  centreUrl,
  readOnly,
}: {
  siteId: string;
  enabled: boolean;
  showVendors: boolean;
  badge: BadgeSettings;
  badgeUrl: string;
  centreUrl: string;
  readOnly: boolean;
}) {
  const { state, pending, formProps } = useActionForm(savePrivacyCentreAction.bind(null, siteId));
  const [placement, setPlacement] = useState<Placement>(badge.placement);
  const [theme, setTheme] = useState<BadgeTheme>(badge.theme);
  const [size, setSize] = useState<BadgeSize>(badge.size);
  const params = [theme === "dark" ? "theme=dark" : "", size === "small" ? "size=small" : ""].filter(Boolean).join("&");
  const src = params ? `${badgeUrl}?${params}` : badgeUrl;
  const { width, height } = badgeDimensions(size);
  const snippet = `<a href="${centreUrl}" target="_blank" rel="noopener"><img src="${src}" alt="${BADGE_LABEL}" width="${width}" height="${height}"></a>`;

  return (
    <form {...formProps} className="space-y-5">
      <Switch
        name="enabled"
        label="Publish privacy centre"
        description="One page with your notice, contact details and data request form."
        defaultChecked={enabled}
        disabled={readOnly}
      />
      <Switch
        name="showVendors"
        label="List your vendors"
        description="Shows the companies you share data with, from your Vendors page."
        defaultChecked={showVendors}
        disabled={readOnly}
      />
      <Switch
        name="badge"
        label="Show a badge on my website"
        description="Appears by itself and links visitors to your privacy centre."
        defaultChecked={badge.enabled}
        disabled={readOnly}
      />

      <div className="space-y-3 rounded-field border border-line p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Option name="badgePlacement" label="Badge position" value={placement} onChange={setPlacement} disabled={readOnly} options={[{ id: "footer", label: "In the footer" }, { id: "corner", label: "Floating corner" }]} />
          <Option name="badgeTheme" label="Badge colour" value={theme} onChange={setTheme} disabled={readOnly} options={[{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }]} />
          <Option name="badgeSize" label="Badge size" value={size} onChange={setSize} disabled={readOnly} options={[{ id: "regular", label: "Regular" }, { id: "small", label: "Small" }]} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={cn("flex items-center justify-center rounded-field border border-line p-6", theme === "light" ? "bg-[#f5f5f7]" : "bg-black")}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the exact SVG shown on the website */}
            <img src={src} alt={BADGE_LABEL} width={width} height={height} />
          </div>
          <BadgeIllustration placement={placement} />
        </div>
        <details className="text-2xs text-mist">
          <summary className="cursor-pointer text-fog">Advanced: place it yourself</summary>
          <div className="mt-3 space-y-2">
            <p>Paste this where you want the badge, then turn the switch above off so it doesn&apos;t show twice.</p>
            <div className="flex flex-col gap-3 rounded-field bg-black/50 p-3 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-fog">{snippet}</code>
              <CopyButton value={snippet} label="Copy" />
            </div>
          </div>
        </details>
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          <FormMessage state={state} className="mr-auto" />
          <SubmitButton pending={pending} pendingLabel="Saving">Save</SubmitButton>
        </div>
      )}
    </form>
  );
}

/** The privacy centre's public address with copy and preview. */
export function PrivacyCentreLinks({ url, live }: { url: string; live: boolean }) {
  return (
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
    </div>
  );
}
