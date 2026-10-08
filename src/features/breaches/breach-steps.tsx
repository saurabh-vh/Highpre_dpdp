"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import type { ActionState } from "@/lib/action-state";
import { BREACH_CHECKLIST } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { closeBreachAction, toggleBreachStepAction } from "./actions";

type Step = { key: string; doneAt?: string | null };

export function BreachSteps({ breachId, steps, closed }: { breachId: string; steps: Step[]; closed: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  const done = new Map(steps.map((s) => [s.key, s.doneAt]));

  return (
    <div>
      <ol className="divide-y divide-white/[0.08]">
        {BREACH_CHECKLIST.map((step, i) => {
          const doneAt = done.get(step.key);
          return (
            <li key={step.key} className="flex gap-4 px-6 py-4">
              <button
                type="button"
                disabled={closed || pending}
                onClick={() => start(() => toggleBreachStepAction(breachId, step.key))}
                aria-pressed={Boolean(doneAt)}
                aria-label={`${doneAt ? "Mark not done" : "Mark done"}: ${step.label}`}
                className={cn(
                  "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border text-2xs font-medium tabular-nums transition-all duration-300 ease-apple",
                  doneAt ? "border-transparent bg-success text-ink" : "border-white/30 hover:border-white",
                )}
              >
                {doneAt ? <Check className="size-3.5" strokeWidth={2.6} aria-hidden /> : i + 1}
              </button>
              <div>
                <p className={cn("text-sm font-medium", doneAt && "text-mist line-through decoration-white/20")}>{step.label}</p>
                <p className="mt-0.5 text-xs text-mist">{step.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {!closed && (
        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
          <FormMessage state={state} className="mr-auto" />
          <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => setState(await closeBreachAction(breachId)))}>
            Close incident
          </Button>
        </div>
      )}
    </div>
  );
}
