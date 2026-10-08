"use client";

import { useEffect, useRef } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { changePasswordAction, updateProfileAction } from "./actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const { state, pending, formProps } = useActionForm(updateProfileAction);
  return (
    <form {...formProps} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Your name" name="name" errors={state.fieldErrors?.name}>
          <Input defaultValue={name} autoComplete="name" />
        </Field>
        <Field label="Email" name="email-display" hint="Contact support to change your login email.">
          <Input defaultValue={email} disabled />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3">
        <FormMessage state={state} className="mr-auto" />
        <SubmitButton pending={pending} pendingLabel="Saving">Save profile</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const { state, pending, formProps } = useActionForm(changePasswordAction);
  const ref = useRef<HTMLFormElement>(null);
  const e = state.fieldErrors ?? {};
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} {...formProps} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Current password" name="currentPassword" errors={e.currentPassword}>
          <Input type="password" autoComplete="current-password" />
        </Field>
        <Field label="New password" name="password" errors={e.password} hint="At least 10 characters.">
          <Input type="password" autoComplete="new-password" />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-3">
        <FormMessage state={state} className="mr-auto" />
        <SubmitButton pending={pending} pendingLabel="Changing">Change password</SubmitButton>
      </div>
    </form>
  );
}
