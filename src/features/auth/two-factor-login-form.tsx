"use client";

import { useState } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cancelTwoFactorLoginAction, verifyTwoFactorLoginAction } from "./actions";

/** Second login step: a 6-digit authenticator code, or a recovery code for people without their phone. */
export function TwoFactorLoginForm({ next }: { next?: string }) {
  const { state, pending, formProps } = useActionForm(verifyTwoFactorLoginAction);
  const [recovery, setRecovery] = useState(false);

  return (
    <div className="space-y-5">
      <form {...formProps} className="space-y-5">
        <FormMessage state={state} />
        <input type="hidden" name="next" value={next ?? ""} />
        {recovery ? (
          <Field key="recovery" label="Recovery code" name="code" errors={state.fieldErrors?.code} hint="One of the codes you saved when you turned on two-factor sign-in. Each works once.">
            <Input autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="xxxxx-xxxxx" required autoFocus />
          </Field>
        ) : (
          <Field key="totp" label="Authentication code" name="code" errors={state.fieldErrors?.code}>
            <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} placeholder="123456" required autoFocus className="tracking-[0.3em]" />
          </Field>
        )}
        <SubmitButton pending={pending} size="lg" className="w-full" pendingLabel="Checking">
          Verify and log in
        </SubmitButton>
      </form>
      <div className="flex items-center justify-between pt-2 text-xs text-mist">
        <button type="button" onClick={() => setRecovery((r) => !r)} className="transition-colors hover:text-paper">
          {recovery ? "Use your authenticator app" : "Use a recovery code"}
        </button>
        <form action={cancelTwoFactorLoginAction}>
          <button type="submit" className="transition-colors hover:text-paper">Start over</button>
        </form>
      </div>
    </div>
  );
}
