"use client";

import { useState } from "react";
import { BannerPreview } from "@/components/consent/banner-preview";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { bannerLayout, type BannerLayout } from "@/lib/banner-layout";
import { contrast, isHex } from "@/lib/color";
import { GOOGLE_CONSENT_LABELS, GOOGLE_CONSENT_TYPES, resolveConsentTypes } from "@/lib/consent-mode";
import { nativeName } from "@/lib/i18n/languages";
import { cn } from "@/lib/utils";
import { saveBannerAction } from "./actions";

type Banner = {
  position: "bottom" | "bottom-left" | "bottom-right";
  theme: "dark" | "light";
  title: string;
  message: string;
  defaultLanguage: string;
  showReopenButton: boolean;
  layout?: BannerLayout | null;
  primaryColor?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  fontFamily?: string | null;
  googleConsentMode?: boolean | null;
  metaPixelConsent?: boolean | null;
  adsDataRedaction?: boolean | null;
  urlPassthrough?: boolean | null;
  consentTypes?: { purpose: string; types?: string[] | null }[] | null;
};

export type SiteBrand = { primary?: string | null; background?: string | null; text?: string | null; font?: string | null } | null;

type Purpose = { key: string; name: string; essential: boolean };

const LAYOUTS: { value: BannerLayout; label: string; hint: string }[] = [
  { value: "box", label: "Box", hint: "A card in a bottom corner. Visitors can keep browsing." },
  { value: "bar", label: "Bar", hint: "A full-width bar along the bottom of the page." },
  { value: "popup", label: "Popup", hint: "A centred window over a dimmed page, until the visitor chooses." },
];

/** Colour swatch plus hex field. Field passes id/name to the text input, which is what submits. */
function ColorInput({ value, onChange, ...props }: { value: string; onChange: (v: string) => void; id?: string; name?: string }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-hidden
        tabIndex={-1}
        value={isHex(value) ? value : "#000000"}
        onChange={(ev) => onChange(ev.target.value)}
        className="h-11 w-11 shrink-0 cursor-pointer rounded-field border border-line bg-transparent p-1"
      />
      <Input {...props} value={value} onChange={(ev) => onChange(ev.target.value.trim())} maxLength={7} placeholder="#1a73e8" className="font-mono" />
    </div>
  );
}

/** Banner settings with a live preview that updates as you type. */
export function BannerSettings({
  siteId,
  banner,
  purposes,
  languages,
  brand,
}: {
  siteId: string;
  banner: Banner;
  purposes: Purpose[];
  languages: string[];
  brand?: SiteBrand;
}) {
  const { state, pending, formProps } = useActionForm(saveBannerAction.bind(null, siteId));
  const [preview, setPreview] = useState({ title: banner.title, message: banner.message, theme: banner.theme });
  const [layout, setLayout] = useState<BannerLayout>(bannerLayout(banner));
  const [corner, setCorner] = useState(banner.position === "bottom-left" ? "bottom-left" : "bottom-right");
  const [colors, setColors] = useState({
    primaryColor: banner.primaryColor ?? "",
    backgroundColor: banner.backgroundColor ?? "",
    textColor: banner.textColor ?? "",
    fontFamily: banner.fontFamily ?? "",
  });
  const [custom, setCustom] = useState(Object.values(colors).some(Boolean));
  const [signals, setSignals] = useState({ google: Boolean(banner.googleConsentMode), meta: Boolean(banner.metaPixelConsent) });
  const mapping = resolveConsentTypes(purposes, banner.consentTypes);
  const e = state.fieldErrors ?? {};

  const hasBrand = Boolean(brand && (brand.primary || brand.background || brand.text || brand.font));
  const applyBrand = () => {
    if (!brand) return;
    setColors({ primaryColor: brand.primary ?? "", backgroundColor: brand.background ?? "", textColor: brand.text ?? "", fontFamily: brand.font ?? "" });
    setCustom(true);
  };
  const shown = custom ? colors : { primaryColor: "", backgroundColor: "", textColor: "", fontFamily: "" };
  const lowContrast = custom && isHex(colors.textColor) && isHex(colors.backgroundColor) && contrast(colors.textColor, colors.backgroundColor) < 4.5;
  const set = (key: keyof typeof colors) => (v: string) => setColors((c) => ({ ...c, [key]: v }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Panel>
        <PanelHeader title="Appearance and wording" />
        <PanelBody>
          <form {...formProps} className="space-y-5">
            <Field label="Heading" name="title" errors={e.title}>
              <Input defaultValue={banner.title} maxLength={80} onChange={(ev) => setPreview((p) => ({ ...p, title: ev.target.value }))} />
            </Field>
            <Field label="Message" name="message" errors={e.message} hint="Keep it short and honest. Leave the standard wording to have it translated automatically.">
              <Textarea defaultValue={banner.message} maxLength={300} rows={3} onChange={(ev) => setPreview((p) => ({ ...p, message: ev.target.value }))} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Layout" name="layout" errors={e.layout} hint={LAYOUTS.find((l) => l.value === layout)?.hint}>
                <Select value={layout} onChange={(ev) => setLayout(ev.target.value as BannerLayout)}>
                  {LAYOUTS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </Select>
              </Field>
              {layout === "bar" ? (
                <input type="hidden" name="position" value="bottom" />
              ) : (
                <Field label={layout === "box" ? "Corner" : "Settings button corner"} name="position" hint={layout === "popup" ? "Where the privacy settings button sits after a choice." : undefined}>
                  <Select value={corner} onChange={(ev) => setCorner(ev.target.value)}>
                    <option value="bottom-right">Bottom right</option>
                    <option value="bottom-left">Bottom left</option>
                  </Select>
                </Field>
              )}
              <Field label="Theme" name="theme" hint={custom ? "Used for any colour you leave empty." : undefined}>
                <Select defaultValue={banner.theme} onChange={(ev) => setPreview((p) => ({ ...p, theme: ev.target.value as Banner["theme"] }))}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </Select>
              </Field>
              <Field label="Fallback language" name="defaultLanguage" errors={e.defaultLanguage} hint="Used when the visitor's browser language isn't offered.">
                <Select defaultValue={banner.defaultLanguage}>
                  {languages.map((l) => (
                    <option key={l} value={l}>{nativeName(l)}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <fieldset className="space-y-4 rounded-field border border-line p-4">
              <legend className="sr-only">Colours and font</legend>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">Colours and font</p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applyBrand}
                    disabled={!hasBrand}
                    title={hasBrand ? undefined : "Scan your website first: we pick up its colours and font during the scan."}
                  >
                    Use my website&apos;s colours
                  </Button>
                  {custom && (
                    <Button size="sm" variant="ghost" onClick={() => setCustom(false)}>
                      Use theme colours
                    </Button>
                  )}
                </div>
              </div>
              {!hasBrand && <p className="text-2xs text-mist">Run a scan and we&apos;ll find your website&apos;s brand colour, background, text colour and font.</p>}
              {custom ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Button colour" name="primaryColor" errors={e.primaryColor}>
                    <ColorInput value={colors.primaryColor} onChange={set("primaryColor")} />
                  </Field>
                  <Field label="Background" name="backgroundColor" errors={e.backgroundColor}>
                    <ColorInput value={colors.backgroundColor} onChange={set("backgroundColor")} />
                  </Field>
                  <Field label="Text" name="textColor" errors={e.textColor}>
                    <ColorInput value={colors.textColor} onChange={set("textColor")} />
                  </Field>
                  <Field
                    label="Font"
                    name="fontFamily"
                    errors={e.fontFamily}
                    className="sm:col-span-3"
                    hint="Your website's own font names, e.g. Inter, sans-serif. Leave empty for the visitor's system font. We never load web fonts."
                  >
                    <Input value={colors.fontFamily} maxLength={200} placeholder="System font" onChange={(ev) => set("fontFamily")(ev.target.value)} />
                  </Field>
                  {lowContrast && (
                    <p role="alert" className="text-2xs font-medium text-warning sm:col-span-3">
                      Text and background are hard to tell apart (under 4.5:1). Choose a darker or lighter text colour.
                    </p>
                  )}
                  <p className="text-2xs text-mist sm:col-span-3">Button text is set to black or white automatically, whichever is easier to read.</p>
                </div>
              ) : (
                <>
                  <input type="hidden" name="primaryColor" value="" />
                  <input type="hidden" name="backgroundColor" value="" />
                  <input type="hidden" name="textColor" value="" />
                  <input type="hidden" name="fontFamily" value="" />
                </>
              )}
            </fieldset>

            <Switch
              name="showReopenButton"
              label="Show a privacy settings button after a choice"
              description="Lets visitors change or withdraw consent as easily as they gave it. Recommended."
              defaultChecked={banner.showReopenButton}
            />

            <fieldset
              className="space-y-4 rounded-field border border-line p-4"
              onChange={(ev) => {
                const t: EventTarget = ev.target;
                if (!(t instanceof HTMLInputElement)) return;
                if (t.name === "googleConsentMode") setSignals((s) => ({ ...s, google: t.checked }));
                if (t.name === "metaPixelConsent") setSignals((s) => ({ ...s, meta: t.checked }));
              }}
            >
              <legend className="sr-only">Google and Meta consent signals</legend>
              <Switch
                name="googleConsentMode"
                label="Google Consent Mode v2"
                description="Needed if you run Google Ads or GA4 for visitors in India or the EU. Google tags stay in a cookieless, “denied” mode until the visitor agrees, and Google is told exactly what they chose."
                defaultChecked={signals.google}
              />
              <Switch
                name="metaPixelConsent"
                label="Meta Pixel consent"
                description="Keeps the Facebook/Instagram Pixel from sending visitor data until they agree to the purpose mapped to Google ad storage (usually Marketing)."
                defaultChecked={signals.meta}
              />
              <div className={cn("space-y-4 border-t border-line pt-4", !signals.google && "hidden")}>
                <Switch
                  name="adsDataRedaction"
                  label="Redact ad click identifiers until consent"
                  description="When ad storage is denied, Google tags drop ad click IDs from requests. Recommended."
                  defaultChecked={banner.adsDataRedaction !== false}
                />
                <Switch
                  name="urlPassthrough"
                  label="Pass ad click information through page URLs"
                  description="Keeps measuring which ads brought visitors without cookies, by adding parameters to links. Leave off unless your ads team asks for it."
                  defaultChecked={Boolean(banner.urlPassthrough)}
                />
              </div>
              {/* Kept in the form while hidden, so saving with signals off doesn't erase the mapping. */}
              <div className={cn("space-y-2 border-t border-line pt-4", !signals.google && !signals.meta && "hidden")}>
                <p className="text-sm">Which purpose allows what</p>
                <p className="text-2xs text-mist">
                  A Google consent type is granted only when the visitor agrees to every purpose ticked for it. Security storage is always granted. Meta follows Ad storage.
                </p>
                <div className="overflow-x-auto rounded-field border border-line">
                  <table className="w-full min-w-[560px] text-left text-2xs">
                    <thead className="text-mist">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">Purpose</th>
                        {GOOGLE_CONSENT_TYPES.map((type) => (
                          <th key={type} scope="col" className="px-2 py-2 text-center font-medium" title={GOOGLE_CONSENT_LABELS[type].hint}>
                            {GOOGLE_CONSENT_LABELS[type].label}
                            <span className="block font-mono text-[10px] font-normal opacity-70">{type}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {purposes.map((p) => (
                        <tr key={p.key}>
                          <th scope="row" className="px-3 py-2 font-normal text-fog">
                            {p.name}
                            <span className="block font-mono text-[10px] text-mist">{p.key}</span>
                          </th>
                          {GOOGLE_CONSENT_TYPES.map((type) => (
                            <td key={type} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                name={`gcm:${p.key}`}
                                value={type}
                                defaultChecked={mapping[p.key]?.includes(type)}
                                aria-label={`${p.name}: ${GOOGLE_CONSENT_LABELS[type].label}`}
                                className="size-4 cursor-pointer accent-white"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </fieldset>

            <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
              <FormMessage state={state} className="mr-auto" />
              <SubmitButton pending={pending} pendingLabel="Saving">Save banner</SubmitButton>
            </div>
          </form>
        </PanelBody>
      </Panel>

      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="relative min-h-[460px] overflow-hidden rounded-panel border hairline bg-[radial-gradient(circle_at_30%_20%,#2c2c2e,transparent_60%),linear-gradient(#111,#000)]">
          <span className="absolute left-5 top-4 text-2xs text-mist">Preview</span>
          {layout === "popup" && <div className="absolute inset-0 bg-black/45" aria-hidden />}
          <div
            className={cn(
              "absolute flex p-3",
              layout === "popup" ? "inset-0 items-center justify-center" : "inset-x-0 bottom-0",
              layout === "box" && (corner === "bottom-left" ? "justify-start" : "justify-end"),
            )}
          >
            <BannerPreview
              title={preview.title}
              message={preview.message}
              theme={preview.theme}
              purposes={purposes}
              layout={layout}
              colors={shown}
              className={layout === "box" ? "max-w-[300px]" : undefined}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
