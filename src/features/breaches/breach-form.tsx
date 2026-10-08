"use client";

import { useEffect, useRef } from "react";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { DATA_CATEGORIES } from "@/lib/constants";
import { createBreachAction } from "./actions";

export function BreachForm() {
  const { state, pending, formProps } = useActionForm(createBreachAction);
  const e = state.fieldErrors ?? {};
  const whenRef = useRef<HTMLInputElement>(null);
  const tzRef = useRef<HTMLInputElement>(null);

  // Filled in the browser so the default reflects the user's own clock and timezone.
  useEffect(() => {
    const offset = new Date().getTimezoneOffset();
    const nowLocal = new Date(Date.now() - offset * 60_000).toISOString().slice(0, 16);
    if (whenRef.current && !whenRef.current.value) whenRef.current.value = nowLocal;
    if (whenRef.current) whenRef.current.max = nowLocal;
    if (tzRef.current) tzRef.current.value = String(offset);
  }, []);

  return (
    <form {...formProps} className="space-y-5">
      <FormMessage state={state} />
      <input ref={tzRef} type="hidden" name="tzOffset" defaultValue="0" />
      <Field label="What happened" name="title" errors={e.title}>
        <Input placeholder="Enquiry spreadsheet shared publicly by mistake" autoFocus />
      </Field>
      <Field label="Details" name="description" errors={e.description} hint="Facts only: what, how you found out, what you've done so far.">
        <Textarea rows={5} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="When you found out" name="discoveredAt" errors={e.discoveredAt} hint="Starts the 72-hour clock.">
          <Input ref={whenRef} type="datetime-local" />
        </Field>
        <Field label="Severity" name="severity" errors={e.severity}>
          <Select defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="People affected (estimate)" name="affectedCount" errors={e.affectedCount}>
          <Input type="number" min={0} placeholder="Unknown" />
        </Field>
      </div>
      <ChoiceChips name="dataCategories" legend="Data involved" options={DATA_CATEGORIES} />
      <div className="flex justify-end border-t hairline pt-5">
        <SubmitButton pending={pending} pendingLabel="Logging incident">Log incident and start checklist</SubmitButton>
      </div>
    </form>
  );
}
