"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/action-state";
import { archiveVendorAction, syncVendorsAction } from "./actions";

/** Adds vendors from each website's latest scan (for scans made before the register existed). */
export function SyncVendorsButton() {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ActionState>({});
  return (
    <div className="flex flex-col items-end gap-3">
      <Button variant="secondary" disabled={pending} aria-busy={pending} onClick={() => startTransition(async () => setState(await syncVendorsAction()))}>
        {pending ? <Spinner /> : <RefreshCw className="size-4" aria-hidden />}
        {pending ? "Syncing…" : "Sync from latest scans"}
      </Button>
      <FormMessage state={state} />
    </div>
  );
}

export function ArchiveVendorButton({ vendorId, name, archived }: { vendorId: string; name: string; archived: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (archived || confirm(`Archive ${name}? It leaves the register and the evidence pack until you restore it.`)) {
          start(() => archiveVendorAction(vendorId, !archived));
        }
      }}
    >
      {archived ? <ArchiveRestore className="size-3.5" aria-hidden /> : <Archive className="size-3.5" aria-hidden />}
      {archived ? "Restore" : "Archive"}
    </Button>
  );
}
