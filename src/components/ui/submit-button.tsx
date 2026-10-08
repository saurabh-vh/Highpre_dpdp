"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";
import { Spinner } from "./spinner";

type Props = Omit<ComponentProps<typeof Button>, "type"> & { pendingLabel?: string; pending?: boolean };

/** Submit button that reflects the form's pending state (from the form or passed in). */
export function SubmitButton({ children, pendingLabel, pending: pendingProp, disabled, ...props }: Props) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending && <Spinner />}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
