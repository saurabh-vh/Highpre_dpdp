"use client";

import { useState } from "react";
import { BannerPreview } from "@/components/consent/banner-preview";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { nativeName } from "@/lib/i18n/languages";
import { saveBannerAction } from "./actions";

type Banner = {
  position: "bottom" | "bottom-left" | "bottom-right";
  theme: "dark" | "light";
  title: string;
  message: string;
  defaultLanguage: string;
  showReopenButton: boolean;
};

/** Banner settings with a live preview that updates as you type. */
export function BannerSettings({ siteId, banner, purposes, languages }: { siteId: string; banner: Banner; purposes: { key: string; name: string; essential: boolean }[]; languages: string[] }) {
  const { state, pending, formProps } = useActionForm(saveBannerAction.bind(null, siteId));
  const [preview, setPreview] = useState({ title: banner.title, message: banner.message, theme: banner.theme });
  const e = state.fieldErrors ?? {};

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
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Theme" name="theme">
                <Select defaultValue={banner.theme} onChange={(ev) => setPreview((p) => ({ ...p, theme: ev.target.value as Banner["theme"] }))}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </Select>
              </Field>
              <Field label="Position" name="position">
                <Select defaultValue={banner.position}>
                  <option value="bottom-right">Bottom right</option>
                  <option value="bottom-left">Bottom left</option>
                  <option value="bottom">Bottom, full width</option>
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
            <Switch
              name="showReopenButton"
              label="Show a privacy settings button after a choice"
              description="Lets visitors change or withdraw consent as easily as they gave it. Recommended."
              defaultChecked={banner.showReopenButton}
            />
            <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
              <FormMessage state={state} className="mr-auto" />
              <SubmitButton pending={pending} pendingLabel="Saving">Save banner</SubmitButton>
            </div>
          </form>
        </PanelBody>
      </Panel>

      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="relative grid min-h-[420px] place-items-center overflow-hidden rounded-panel border hairline bg-[radial-gradient(circle_at_30%_20%,#2c2c2e,transparent_60%),linear-gradient(#111,#000)] p-6">
          <span className="absolute left-5 top-4 text-2xs text-mist">Preview</span>
          <BannerPreview title={preview.title} message={preview.message} theme={preview.theme} purposes={purposes} />
        </div>
      </div>
    </div>
  );
}
