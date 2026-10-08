import type { ZodError } from "zod";

/** Uniform return shape for server actions consumed by `useActionState`. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialActionState: ActionState = {};

export function fromZodError(error: ZodError, message = "Check the highlighted fields."): ActionState {
  return { ok: false, message, fieldErrors: error.flatten().fieldErrors as Record<string, string[]> };
}

export const fail = (message: string): ActionState => ({ ok: false, message });
export const succeed = (message?: string): ActionState => ({ ok: true, message });
