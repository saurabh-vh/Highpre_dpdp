"use client";

import Link from "next/link";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { loginAction } from "./actions";

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const { state, pending, formProps } = useActionForm(loginAction);
  const e = state.fieldErrors ?? {};

  return (
    <form {...formProps} className="space-y-5">
      {notice && <FormMessage state={{ ok: true, message: notice }} />}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email" errors={e.email}>
        <Input type="email" autoComplete="email" placeholder="you@business.in" required autoFocus />
      </Field>
      <Field label="Password" name="password" errors={e.password}>
        <Input type="password" autoComplete="current-password" required />
      </Field>
      <div className="-mt-1 flex justify-end">
        <Link href="/forgot-password" className="text-xs text-mist transition-colors hover:text-paper">
          Forgot password?
        </Link>
      </div>
      <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel="Logging in">
        Log in
      </SubmitButton>
      <p className="pt-2 text-center text-xs text-mist">
        New to HighPre?{" "}
        <Link href="/register" className="text-paper underline decoration-white/30 underline-offset-4 hover:decoration-white">
          Create an account
        </Link>
      </p>
    </form>
  );
}
