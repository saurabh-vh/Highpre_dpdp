"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { acceptInviteAction, acceptInviteWithSignupAction } from "./actions";

export function AcceptInviteButton({ token, orgName }: { token: string; orgName: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  return (
    <div className="space-y-4">
      <Button size="lg" className="w-full" disabled={pending} onClick={() => start(async () => setState(await acceptInviteAction(token)))}>
        {pending && <Spinner />}
        Join {orgName}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}

export function AcceptInviteSignup({ token, email }: { token: string; email: string }) {
  const { state, pending, formProps } = useActionForm(acceptInviteWithSignupAction);
  const e = state.fieldErrors ?? {};
  return (
    <form {...formProps} className="space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field label="Email" name="email-display">
        <Input value={email} disabled readOnly />
      </Field>
      <Field label="Your name" name="name" errors={e.name}>
        <Input autoComplete="name" autoFocus />
      </Field>
      <Field label="Choose a password" name="password" errors={e.password} hint="At least 10 characters.">
        <Input type="password" autoComplete="new-password" />
      </Field>
      <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel="Joining">
        Create account and join
      </SubmitButton>
    </form>
  );
}
