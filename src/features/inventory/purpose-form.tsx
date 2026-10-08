"use client";

import { useEffect, useRef } from "react";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { DATA_CATEGORIES } from "@/lib/constants";
import { languageOf, purposeText } from "@/lib/i18n";
import { savePurposeAction } from "./actions";

export type PurposeValues = {
  key: string;
  name: string;
  description: string;
  translations?: { lang: string; name?: string | null; description?: string | null }[] | null;
  nameHi?: string | null;
  descriptionHi?: string | null;
  dataCategories: string[];
  essential: boolean;
  tracking?: boolean | null;
  retentionDays: number;
  storedIn?: string | null;
  sharedWith?: string | null;
};

/** Add or edit one purpose in the data inventory. */
export function PurposeForm({ siteId, purpose, languages }: { siteId: string; purpose?: PurposeValues; languages: string[] }) {
  const { state, pending, formProps } = useActionForm(savePurposeAction.bind(null, siteId, purpose?.key ?? ""));
  const formRef = useRef<HTMLFormElement>(null);
  const e = state.fieldErrors ?? {};
  const others = languages.filter((l) => l !== "en");

  useEffect(() => {
    if (state.ok && !purpose) formRef.current?.reset();
  }, [state, purpose]);

  return (
    <form ref={formRef} {...formProps} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Purpose" name="name" errors={e.name} hint="Say it the way a customer would understand it.">
          <Input defaultValue={purpose?.name} placeholder="Calling back people who enquire" />
        </Field>
        <Field label="Short key" name="key" errors={e.key} hint={<>Used in code: <code className="font-mono">data-hp-purpose=&quot;key&quot;</code></>}>
          <Input defaultValue={purpose?.key} placeholder="enquiries" className="font-mono" />
        </Field>
      </div>
      <Field label="What you do with the data" name="description" errors={e.description}>
        <Textarea defaultValue={purpose?.description} rows={3} placeholder="We use the details from our contact form to call or WhatsApp you about your enquiry." />
      </Field>
      <ChoiceChips
        name="dataCategories"
        legend="Data used"
        options={DATA_CATEGORIES}
        defaultValue={purpose?.dataCategories}
        error={e.dataCategories?.[0]}
      />
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Keep for (days)" name="retentionDays" errors={e.retentionDays} hint="365 = 1 year">
          <Input type="number" min={1} max={3650} defaultValue={purpose?.retentionDays ?? 365} />
        </Field>
        <Field label="Stored in" name="storedIn" errors={e.storedIn} hint="Internal only, not shown publicly.">
          <Input defaultValue={purpose?.storedIn ?? ""} placeholder="Zoho CRM, Google Sheets" />
        </Field>
        <Field label="Shared with" name="sharedWith" errors={e.sharedWith} hint="Shown in your notice.">
          <Input defaultValue={purpose?.sharedWith ?? ""} placeholder="Our delivery partner" />
        </Field>
      </div>
      {others.length > 0 && (
        <details className="group rounded-field border border-line px-4 py-3">
          <summary className="cursor-pointer text-xs text-fog">
            Wording in other languages <span className="text-mist">(optional)</span>
          </summary>
          <p className="mt-3 text-2xs text-mist">
            Leave blank to use our standard translation for built-in purposes, or the English text for your own.
          </p>
          <div className="mt-4 space-y-5">
            {others.map((lang) => {
              const own = purpose?.translations?.find((t) => t.lang === lang);
              const legacy = lang === "hi" ? { name: purpose?.nameHi, description: purpose?.descriptionHi } : null;
              const fallback = purpose ? purposeText({ ...purpose, translations: [], nameHi: "", descriptionHi: "" }, lang) : null;
              const l = languageOf(lang);
              return (
                <div key={lang} className="grid gap-4 md:grid-cols-[1fr_2fr]">
                  <Field label={`Purpose in ${l.label}`} name={`name_${lang}`}>
                    <Input defaultValue={own?.name || legacy?.name || ""} placeholder={fallback?.name} lang={lang} />
                  </Field>
                  <Field label={`Description in ${l.label}`} name={`description_${lang}`}>
                    <Input defaultValue={own?.description || legacy?.description || ""} placeholder={fallback?.description} lang={lang} />
                  </Field>
                </div>
              );
            })}
          </div>
        </details>
      )}
      <div className="space-y-4 rounded-field border border-line p-4">
        <Switch
          name="essential"
          label="Essential for the website to work"
          description="Essential purposes can't be switched off by visitors. Use sparingly: marketing and analytics are never essential."
          defaultChecked={purpose?.essential}
        />
        <div className="border-t border-line pt-4">
          <Switch
            name="tracking"
            label="Involves tracking, profiling or targeted ads"
            description="For example analytics, retargeting pixels or ad measurement. These are never switched on for under-18s."
            defaultChecked={Boolean(purpose?.tracking)}
          />
          {e.tracking && <p role="alert" className="mt-2 text-2xs font-medium text-danger">{e.tracking[0]}</p>}
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
        <FormMessage state={state} className="mr-auto" />
        <SubmitButton pending={pending} pendingLabel="Saving">{purpose ? "Save changes" : "Add purpose"}</SubmitButton>
      </div>
    </form>
  );
}
