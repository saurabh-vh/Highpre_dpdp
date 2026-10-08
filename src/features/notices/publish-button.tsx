"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Spinner } from "@/components/ui/spinner";
import type { ActionState } from "@/lib/action-state";
import { publishNoticeAction } from "./actions";

export function PublishNoticeButton({ siteId, nextVersion, disabled }: { siteId: string; nextVersion: number; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  return (
    <div className="flex flex-col items-end gap-3">
      <Button disabled={pending || disabled} onClick={() => start(async () => setState(await publishNoticeAction(siteId)))}>
        {pending && <Spinner />}
        Publish version {nextVersion}
      </Button>
      <FormMessage state={state} className="max-w-sm" />
    </div>
  );
}
