"use client";

import { useEffect, useRef } from "react";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { REQUEST_STATUSES } from "@/lib/constants";
import { updateRequestAction } from "./actions";

export function RequestUpdateForm({ requestId, status }: { requestId: string; status: string }) {
  const { state, pending, formProps } = useActionForm(updateRequestAction.bind(null, requestId));
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.ok && noteRef.current) noteRef.current.value = "";
  }, [state]);

  return (
    <form {...formProps} className="space-y-5">
      <Field label="Status" name="status" errors={state.fieldErrors?.status}>
        <Select defaultValue={status}>
          {REQUEST_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Internal note" name="note" errors={state.fieldErrors?.note} hint="What you did, and when you replied to the person. Kept as an audit trail.">
        <Textarea ref={noteRef} rows={4} placeholder="Deleted the lead from Zoho CRM and confirmed by email on…" />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="w-full" pendingLabel="Saving">
        Save update
      </SubmitButton>
    </form>
  );
}
