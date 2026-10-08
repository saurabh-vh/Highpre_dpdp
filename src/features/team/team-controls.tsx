"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/auth/permissions";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { changeRoleAction, inviteMemberAction, removeMemberAction, resendInviteAction, revokeInviteAction } from "./actions";

export function InviteForm() {
  const { state, pending, formProps } = useActionForm(inviteMemberAction);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} {...formProps} className="grid items-start gap-4 md:grid-cols-[1fr_200px_auto]">
      <Field label="Email" name="email" errors={state.fieldErrors?.email}>
        <Input type="email" placeholder="colleague@business.in" autoComplete="off" />
      </Field>
      <Field label="Role" name="role" errors={state.fieldErrors?.role}>
        <Select defaultValue="member">
          <option value="member">{ROLE_LABELS.member}</option>
          <option value="admin">{ROLE_LABELS.admin}</option>
        </Select>
      </Field>
      <SubmitButton pending={pending} className="md:mt-[26px]" pendingLabel="Sending">Send invitation</SubmitButton>
      <p className="text-2xs text-mist md:col-span-3">
        Member: {ROLE_DESCRIPTIONS.member} Admin: {ROLE_DESCRIPTIONS.admin}
      </p>
      <FormMessage state={state} className="md:col-span-3" />
    </form>
  );
}

/** Role picker that saves on change. */
export function RoleSelect({ userId, role, canEditOwner }: { userId: string; role: string; canEditOwner: boolean }) {
  const { state, pending, formProps } = useActionForm(changeRoleAction);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} {...formProps} className="flex flex-col items-end gap-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="sr-only" htmlFor={`role-${userId}`}>Role</label>
      <Select
        id={`role-${userId}`}
        name="role"
        defaultValue={role}
        disabled={pending}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 w-32 text-xs"
      >
        {(canEditOwner || role === "owner") && <option value="owner">{ROLE_LABELS.owner}</option>}
        <option value="admin">{ROLE_LABELS.admin}</option>
        <option value="member">{ROLE_LABELS.member}</option>
      </Select>
      {state.message && !state.ok && <FormMessage state={state} className="max-w-xs" />}
    </form>
  );
}

function useActionButton(action: () => Promise<ActionState>, confirmText?: string) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  const run = () => {
    if (confirmText && !confirm(confirmText)) return;
    start(async () => setState(await action()));
  };
  return { pending, state, run };
}

export function RemoveMemberButton({ userId, name, self }: { userId: string; name: string; self: boolean }) {
  const { pending, state, run } = useActionButton(
    () => removeMemberAction(userId),
    self ? "Leave this team? You'll lose access to its websites and records." : `Remove ${name} from the team?`,
  );
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="ghost" size="sm" onClick={run} disabled={pending}>
        {pending && <Spinner />}
        {self ? "Leave" : "Remove"}
      </Button>
      {state.message && !state.ok && <FormMessage state={state} className="max-w-xs" />}
    </div>
  );
}

export function InviteActions({ inviteId }: { inviteId: string }) {
  const resend = useActionButton(() => resendInviteAction(inviteId));
  const revoke = useActionButton(() => revokeInviteAction(inviteId), "Revoke this invitation?");
  const message = resend.state.message ? resend.state : revoke.state;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={resend.run} disabled={resend.pending || revoke.pending}>
          {resend.pending && <Spinner />}
          Resend
        </Button>
        <Button variant="ghost" size="sm" onClick={revoke.run} disabled={resend.pending || revoke.pending}>
          {revoke.pending && <Spinner />}
          Revoke
        </Button>
      </div>
      {message.message && <FormMessage state={message} className="max-w-xs" />}
    </div>
  );
}
