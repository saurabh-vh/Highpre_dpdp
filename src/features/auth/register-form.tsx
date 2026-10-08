"use client";

import Link from "next/link";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { registerAction } from "./actions";

export function RegisterForm() {
  const { state, pending, formProps } = useActionForm(registerAction);
  const e = state.fieldErrors ?? {};

  return (
    <form {...formProps} className="space-y-5">
      <FormMessage state={state} />
      <Field label="Your name" name="name" errors={e.name}>
        <Input autoComplete="name" required autoFocus />
      </Field>
      <Field label="Business name" name="company" errors={e.company} hint="Shown in your privacy notices. You can change it later.">
        <Input autoComplete="organization" required />
      </Field>
      <Field label="Work email" name="email" errors={e.email}>
        <Input type="email" autoComplete="email" placeholder="you@business.in" required />
      </Field>
      <Field label="Password" name="password" errors={e.password} hint="At least 10 characters.">
        <Input type="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel="Creating account">
        Create account
      </SubmitButton>
      <p className="pt-2 text-center text-xs text-mist">
        Already have an account?{" "}
        <Link href="/login" className="text-paper underline decoration-white/30 underline-offset-4 hover:decoration-white">
          Log in
        </Link>
      </p>
    </form>
  );
}
