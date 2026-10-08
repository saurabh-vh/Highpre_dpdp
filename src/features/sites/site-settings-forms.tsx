"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { LANGUAGES } from "@/lib/i18n/languages";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cn } from "@/lib/utils";
import { saveChildrenSettingsAction, saveSiteLanguagesAction, updateSiteAction } from "./actions";

export function SiteDetailsForm({ siteId, name, url, readOnly }: { siteId: string; name: string; url: string; readOnly: boolean }) {
  const { state, pending, formProps } = useActionForm(updateSiteAction.bind(null, siteId));
  const e = state.fieldErrors ?? {};
  return (
    <form {...formProps} className="space-y-5">
      <fieldset disabled={readOnly} className="grid gap-5 md:grid-cols-2">
        <Field label="Name" name="name" errors={e.name}>
          <Input defaultValue={name} />
        </Field>
        <Field label="Address" name="url" errors={e.url}>
          <Input defaultValue={url} inputMode="url" />
        </Field>
      </fieldset>
      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          <FormMessage state={state} className="mr-auto" />
          <SubmitButton pending={pending} pendingLabel="Saving">Save details</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function LanguagesForm({ siteId, selected, max, readOnly }: { siteId: string; selected: string[]; max: number; readOnly: boolean }) {
  const { state, pending, formProps } = useActionForm(saveSiteLanguagesAction.bind(null, siteId));
  return (
    <form {...formProps} className="space-y-5">
      <fieldset disabled={readOnly}>
        <legend className="sr-only">Languages</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {LANGUAGES.map((l) => {
            const locked = l.code === "en";
            return (
              <label key={l.code} className={cn("cursor-pointer", locked && "cursor-default")}>
                <input
                  type="checkbox"
                  name="languages"
                  value={l.code}
                  defaultChecked={locked || selected.includes(l.code)}
                  disabled={locked}
                  className="peer sr-only"
                />
                <span className="flex items-center justify-between gap-3 rounded-field border border-line px-4 py-3 transition-colors hover:border-white/25 peer-checked:border-white/60 peer-checked:bg-white/[0.06] peer-focus-visible:ring-2 peer-focus-visible:ring-white">
                  <span>
                    <span className="block text-sm" lang={l.code}>{l.native}</span>
                    <span className="block text-2xs text-mist">{l.label}{locked ? " · always on" : ""}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <p className="text-2xs text-mist">
        Your plan includes up to {max} languages. Translations were drafted for HighPre; have a native speaker review them before relying on them.
      </p>
      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          <FormMessage state={state} className="mr-auto" />
          <SubmitButton pending={pending} pendingLabel="Saving">Save languages</SubmitButton>
        </div>
      )}
    </form>
  );
}

export function ChildrenForm({ siteId, enabled, readOnly }: { siteId: string; enabled: boolean; readOnly: boolean }) {
  const { state, pending, formProps } = useActionForm(saveChildrenSettingsAction.bind(null, siteId));
  return (
    <form {...formProps} className="space-y-5">
      <Switch
        name="enabled"
        label="Ask visitors their age and collect parental consent"
        description="Under-18s get essential features only until a parent or guardian verifies their email and agrees. Tracking and targeted ads stay off for children even then (DPDP section 9)."
        defaultChecked={enabled}
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
