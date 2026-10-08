"use client";

import { useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addPresetPurposeAction, deletePurposeAction } from "./actions";

export function DeletePurposeButton({ siteId, purposeKey, name }: { siteId: string; purposeKey: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm(`Remove "${name}" from the inventory? Publish your notice again afterwards.`)) {
          start(() => deletePurposeAction(siteId, purposeKey));
        }
      }}
    >
      <Trash2 className="size-3.5" aria-hidden />
      Remove
    </Button>
  );
}

export function AddPresetButton({ siteId, presetKey, label }: { siteId: string; presetKey: string; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => start(async () => void (await addPresetPurposeAction(siteId, presetKey)))}>
      <Plus className="size-3.5" aria-hidden />
      {label}
    </Button>
  );
}
