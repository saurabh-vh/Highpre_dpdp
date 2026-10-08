"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { deleteSiteAction } from "./actions";

export function DeleteSiteForm({ siteId, siteName }: { siteId: string; siteName: string }) {
  const { state, pending, formProps } = useActionForm(deleteSiteAction.bind(null, siteId));
  return (
    <form {...formProps} className="grid items-start gap-4 md:grid-cols-[1fr_auto]">
      <Field label={`Type "${siteName}" to confirm`} name="confirm">
        <Input autoComplete="off" />
      </Field>
      <SubmitButton pending={pending} variant="outline" className="md:mt-[26px]" pendingLabel="Removing">
        Remove website
      </SubmitButton>
      <FormMessage state={state} className="md:col-span-2" />
    </form>
  );
}
