"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  /** Must match the control's `name` so server errors map to it. */
  name: string;
  hint?: ReactNode;
  errors?: string[];
  className?: string;
  children: ReactElement<Record<string, unknown>>;
};

/** Label + control + hint + error, with ids wired for screen readers. */
export function Field({ label, name, hint, errors, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = errors?.[0];
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, { id, name, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })
    : children;

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-fog">
        {label}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-2xs text-mist">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-2xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
