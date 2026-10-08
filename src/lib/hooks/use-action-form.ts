"use client";

import { startTransition, useActionState, type FormEvent } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";

/**
 * Wires a server action to a form while keeping what the user typed.
 * React 19 resets uncontrolled forms after an action completes, which would
 * wipe fields on a validation error; submitting through onSubmit avoids that.
 * `action` stays set so the form still works before JavaScript loads.
 * Actions may return extra fields on top of `ActionState` (typed via `S`).
 */
export function useActionForm<S extends ActionState = ActionState>(action: (state: S, formData: FormData) => Promise<S>) {
  const [state, dispatch, pending] = useActionState<S, FormData>(action, initialActionState as Awaited<S>);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return { state, pending, formProps: { action: dispatch, onSubmit, noValidate: true } };
}
