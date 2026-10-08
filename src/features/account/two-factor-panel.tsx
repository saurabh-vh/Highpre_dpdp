"use client";

import { Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopyButton } from "@/components/ui/copy-button";
import { Field } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { useActionForm } from "@/lib/hooks/use-action-form";
import {
  cancelTwoFactorSetupAction,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  regenerateRecoveryCodesAction,
  startTwoFactorSetupAction,
} from "./two-factor-actions";

type Props = {
  status: "off" | "pending" | "on";
  /** Present while setting up: QR image (data URL, may be missing), the key in groups of four, the raw key and otpauth link. */
  setup?: { qr: string | null; key: string; secret: string; uri: string };
  enabledAt?: string;
  codesLeft: number;
};

const codeInput = <Input inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={7} className="tracking-[0.3em]" />;

/**
 * Account → Two-factor sign-in. Stays mounted across the server refresh that
 * follows each action, so recovery codes returned by an action remain on
 * screen until the person confirms they've saved them.
 */
export function TwoFactorPanel({ status, setup, enabledAt, codesLeft }: Props) {
  const confirm = useActionForm(confirmTwoFactorSetupAction);
  const regen = useActionForm(regenerateRecoveryCodesAction);
  const disable = useActionForm(disableTwoFactorAction);
  const [codes, setCodes] = useState<string[] | null>(null);
  const disableRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (confirm.state.recoveryCodes) setCodes(confirm.state.recoveryCodes);
  }, [confirm.state]);
  useEffect(() => {
    if (regen.state.recoveryCodes) setCodes(regen.state.recoveryCodes);
  }, [regen.state]);
  useEffect(() => {
    if (disable.state.ok) disableRef.current?.reset();
  }, [disable.state]);

  if (codes) return <RecoveryCodes codes={codes} message={(regen.state.recoveryCodes === codes ? regen.state : confirm.state).message} onDone={() => setCodes(null)} />;

  if (status === "off") {
    return (
      <div className="space-y-5">
        {disable.state.ok && <FormMessage state={disable.state} />}
        <p className="max-w-prose text-sm text-fog">
          Use an authenticator app such as Google Authenticator, Microsoft Authenticator, 1Password or Authy. After your password, HighPre will ask for the 6-digit code it shows.
        </p>
        <form action={startTwoFactorSetupAction}>
          <SubmitButton pendingLabel="Starting">Set up two-factor sign-in</SubmitButton>
        </form>
      </div>
    );
  }

  if (status === "pending" && setup) {
    return (
      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          {setup.qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- server-rendered SVG data URL
            <img src={setup.qr} alt="QR code to add HighPre to your authenticator app" width={220} height={220} className="rounded-field bg-white p-2" />
          ) : (
            <a href={setup.uri} className="block rounded-field border hairline p-4 text-xs text-fog underline underline-offset-4">Open in authenticator app</a>
          )}
        </div>
        <div className="space-y-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">1. Scan the QR code with your authenticator app</p>
            <p className="text-xs text-mist">Can&apos;t scan it? Add an account manually with this key (time-based):</p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="rounded-field bg-white/[0.06] px-3 py-2 font-mono text-sm tracking-wider">{setup.key}</code>
              <CopyButton value={setup.secret} label="Copy key" />
            </div>
          </div>
          <form {...confirm.formProps} className="space-y-4">
            <p className="text-sm font-medium">2. Enter the 6-digit code it shows</p>
            <FormMessage state={confirm.state} />
            <div className="flex flex-wrap items-start gap-3">
              <Field label="Code" name="code" errors={confirm.state.fieldErrors?.code} className="w-48">
                {codeInput}
              </Field>
              <SubmitButton pending={confirm.pending} pendingLabel="Checking" className="mt-6">Turn on</SubmitButton>
            </div>
          </form>
          <form action={cancelTwoFactorSetupAction}>
            <SubmitButton variant="ghost" size="sm">Cancel setup</SubmitButton>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="success">On</Badge>
        <span className="text-xs text-mist">
          {enabledAt ? `Since ${enabledAt}. ` : ""}
          {codesLeft} recovery code{codesLeft === 1 ? "" : "s"} left.
        </span>
      </div>
      {codesLeft <= 3 && (
        <Callout tone="warning" title="Running out of recovery codes">
          Create new ones below so you can still get in if you lose your phone.
        </Callout>
      )}

      <form {...regen.formProps} className="space-y-4 border-t hairline pt-6">
        <div>
          <p className="text-sm font-medium">New recovery codes</p>
          <p className="mt-1 text-xs text-mist">Replaces all your recovery codes. Enter a code from your app to confirm.</p>
        </div>
        <FormMessage state={regen.state} />
        <div className="flex flex-wrap items-start gap-3">
          <Field label="Code" name="code" errors={regen.state.fieldErrors?.code} className="w-48">
            {codeInput}
          </Field>
          <SubmitButton pending={regen.pending} variant="outline" pendingLabel="Creating" className="mt-6">Create new codes</SubmitButton>
        </div>
      </form>

      <form ref={disableRef} {...disable.formProps} className="space-y-4 border-t hairline pt-6">
        <div>
          <p className="text-sm font-medium">Turn off two-factor sign-in</p>
          <p className="mt-1 text-xs text-mist">Signs out your other devices. You can use a recovery code if you no longer have your app.</p>
        </div>
        <FormMessage state={disable.state} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Current password" name="currentPassword" errors={disable.state.fieldErrors?.currentPassword}>
            <Input type="password" autoComplete="current-password" />
          </Field>
          <Field label="Code from your app, or a recovery code" name="code" errors={disable.state.fieldErrors?.code}>
            <Input autoComplete="one-time-code" autoCapitalize="none" spellCheck={false} />
          </Field>
        </div>
        <div className="flex justify-end">
          <SubmitButton pending={disable.pending} variant="outline" pendingLabel="Turning off">Turn off</SubmitButton>
        </div>
      </form>
    </div>
  );
}

/** Shown once: the plain recovery codes, with copy and download. */
function RecoveryCodes({ codes, message, onDone }: { codes: string[]; message?: string; onDone: () => void }) {
  const text = `HighPre recovery codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`;

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "highpre-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {message && <FormMessage state={{ ok: true, message }} />}
      <Callout tone="warning" title="Save your recovery codes now">
        If you lose your phone, each of these codes lets you sign in once. This is the only time they&apos;re shown.
      </Callout>
      <ul className="grid max-w-md grid-cols-2 gap-x-6 gap-y-2 rounded-field bg-white/[0.04] p-5 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <CopyButton value={codes.join("\n")} label="Copy codes" />
        <Button variant="secondary" size="sm" onClick={download}>
          <Download className="size-3.5" aria-hidden />
          Download .txt
        </Button>
        <Button size="sm" onClick={onDone} className="ml-auto">I&apos;ve saved them</Button>
      </div>
    </div>
  );
}
