"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { createSiteAction } from "./actions";

export function AddSiteForm() {
  const { state, pending, formProps } = useActionForm(createSiteAction);
  const e = state.fieldErrors ?? {};
  return (
    <form {...formProps} className="grid items-start gap-4 md:grid-cols-[1fr_1.2fr_auto]">
      <Field label="Name" name="name" errors={e.name}>
        <Input placeholder="Main website" required />
      </Field>
      <Field label="Address" name="url" errors={e.url}>
        <Input placeholder="yourbusiness.in" inputMode="url" required />
      </Field>
      <SubmitButton pending={pending} className="md:mt-[26px]" pendingLabel="Adding">
        Add website
      </SubmitButton>
      <FormMessage state={state} className="md:col-span-3" />
    </form>
  );
}
