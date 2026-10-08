"use client";

import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/switch";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { saveTwoFactorPolicyAction } from "./actions";

export function TwoFactorPolicyForm({ required, readOnly }: { required: boolean; readOnly: boolean }) {
  const { state, pending, formProps } = useActionForm(saveTwoFactorPolicyAction);
  return (
    <form {...formProps} className="space-y-5">
      <Switch
        name="requireTwoFactor"
        label="Require two-factor sign-in for owners and admins"
        description="Owners and admins without it are sent to their account page to set it up before they can continue. You need it on yourself first."
        defaultChecked={required}
        disabled={readOnly}
      />
      <div className="flex items-center justify-end gap-3">
        <FormMessage state={state} className="mr-auto" />
        {!readOnly && <SubmitButton pending={pending} pendingLabel="Saving">Save</SubmitButton>}
      </div>
    </form>
  );
}
