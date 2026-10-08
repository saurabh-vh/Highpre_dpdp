import { CheckCircle2, CircleAlert } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { cn } from "@/lib/utils";

/** Announces the result of a server action to sighted and screen-reader users. */
export function FormMessage({ state, className }: { state: ActionState; className?: string }) {
  if (!state.message) return null;
  const Icon = state.ok ? CheckCircle2 : CircleAlert;
  return (
    <p
      role={state.ok ? "status" : "alert"}
      className={cn(
        "flex animate-fade-in items-start gap-2 rounded-field px-4 py-3 text-xs",
        state.ok ? "border border-success/25 bg-success/[0.07] text-fog" : "border border-danger/30 bg-danger/[0.07] text-paper",
        className,
      )}
    >
      <Icon className={cn("mt-px size-4 shrink-0", state.ok ? "text-success" : "text-danger")} strokeWidth={1.8} aria-hidden />
      {state.message}
    </p>
  );
}
