"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/action-state";
import { runSiteScanAction } from "./actions";

/** Triggers a scan; can start automatically for a newly added website. */
export function RunScanButton({ siteId, hasScan, autoStart }: { siteId: string; hasScan: boolean; autoStart?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({});
  const started = useRef(false);

  const run = () =>
    startTransition(async () => {
      setState(await runSiteScanAction(siteId));
    });

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className="flex flex-col items-end gap-3">
      <Button onClick={run} disabled={pending} variant={hasScan ? "secondary" : "primary"} aria-busy={pending}>
        {pending ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
        {pending ? "Scanning…" : hasScan ? "Scan again" : "Scan now"}
      </Button>
      {state.message && !state.ok && <FormMessage state={state} />}
    </div>
  );
}
