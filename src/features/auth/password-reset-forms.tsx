"use client";

import Link from "next/link";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { forgotPasswordAction, resetPasswordAction } from "./actions";

export function ForgotPasswordForm() {
  const { state, pending, formProps } = useActionForm(forgotPasswordAction);
  return (
    <form {...formProps} className="space-y-5">
      <FormMessage state={state} />
      <Field label="Email" name="email" errors={state.fieldErrors?.email}>
        <Input type="email" autoComplete="email" required autoFocus />
      </Field>
      <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel="Sending link">
        Send reset link
      </SubmitButton>
      <p className="pt-2 text-center text-xs text-mist">
        <Link href="/login" className="hover:text-paper">Back to log in</Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { state, pending, formProps } = useActionForm(resetPasswordAction);
  return (
    <form {...formProps} className="space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="New password" name="password" errors={state.fieldErrors?.password} hint="At least 10 characters.">
        <Input type="password" autoComplete="new-password" required minLength={10} autoFocus />
      </Field>
      <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel="Saving">
        Save new password
      </SubmitButton>
    </form>
  );
}
