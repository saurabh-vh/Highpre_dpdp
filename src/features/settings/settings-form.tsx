"use client";

import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { saveOrgSettingsAction } from "./actions";

type OrgValues = {
  name: string;
  legalName?: string | null;
  address?: string | null;
  grievanceOfficerName?: string | null;
  grievanceEmail?: string | null;
  grievancePhone?: string | null;
  responseDays: number;
};

export function SettingsForm({ org, readOnly }: { org: OrgValues; readOnly: boolean }) {
  const { state, pending, formProps } = useActionForm(saveOrgSettingsAction);
  const e = state.fieldErrors ?? {};

  return (
    <form {...formProps} className="space-y-8">
      <fieldset disabled={readOnly} className="space-y-5">
        <legend className="mb-5 text-sm font-semibold">Business</legend>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Display name" name="name" errors={e.name}>
            <Input defaultValue={org.name} />
          </Field>
          <Field label="Registered legal name" name="legalName" errors={e.legalName} hint="Used in privacy notices.">
            <Input defaultValue={org.legalName ?? ""} placeholder="Acme Clinics Private Limited" />
          </Field>
        </div>
        <Field label="Registered address" name="address" errors={e.address}>
          <Textarea defaultValue={org.address ?? ""} rows={2} />
        </Field>
      </fieldset>

      <fieldset disabled={readOnly} className="space-y-5 border-t hairline pt-8">
        <legend className="mb-1 text-sm font-semibold">Grievance contact</legend>
        <p className="!mt-0 mb-5 text-xs text-mist">The person who answers privacy questions and complaints. Published in every notice.</p>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Name" name="grievanceOfficerName" errors={e.grievanceOfficerName}>
            <Input defaultValue={org.grievanceOfficerName ?? ""} />
          </Field>
          <Field label="Email" name="grievanceEmail" errors={e.grievanceEmail} hint="New data requests are also sent here.">
            <Input type="email" defaultValue={org.grievanceEmail ?? ""} placeholder="privacy@business.in" />
          </Field>
          <Field label="Phone" name="grievancePhone" errors={e.grievancePhone}>
            <Input type="tel" defaultValue={org.grievancePhone ?? ""} />
          </Field>
        </div>
        <Field label="Reply to requests within (days)" name="responseDays" errors={e.responseDays} hint="Your published commitment. Request due dates are calculated from this.">
          <Input type="number" min={1} max={90} defaultValue={org.responseDays} className="max-w-32" />
        </Field>
      </fieldset>

      <div className="flex items-center justify-end gap-3 border-t hairline pt-6">
        <FormMessage state={state} className="mr-auto" />
        {!readOnly && <SubmitButton pending={pending} pendingLabel="Saving">Save settings</SubmitButton>}
      </div>
    </form>
  );
}
