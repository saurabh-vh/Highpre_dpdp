"use client";

import { useEffect, useState, useTransition } from "react";
import { Apple, AppWindow, Download, Monitor } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { FormMessage } from "@/components/ui/form-message";
import { Spinner } from "@/components/ui/spinner";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useActionForm } from "@/lib/hooks/use-action-form";
import { cn } from "@/lib/utils";
import {
  acknowledgeAlertsAction,
  markNotSensitiveAction,
  revokeDeviceAction,
  rotateEnrollKeyAction,
  saveAgentPolicyAction,
  setEnrollmentAction,
} from "./actions";

type Detected = "windows" | "mac" | null;

/** Best guess at the visitor's OS, used to put the right download first. */
export function useDetectedOs(): Detected {
  const [os, setOs] = useState<Detected>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    setOs(/Windows/i.test(ua) ? "windows" : /Mac OS X|Macintosh/i.test(ua) ? "mac" : null);
  }, []);
  return os;
}

const DOWNLOADS = [
  { platform: "windows", label: "Windows", hint: "Windows 10 or 11", icon: Monitor, os: "windows" },
  { platform: "mac-arm64", label: "Mac (M1 or newer)", hint: "M1, M2, M3, M4", icon: Apple, os: "mac" },
  { platform: "mac-intel", label: "Mac (Intel)", hint: "Older Macs", icon: Apple, os: "mac" },
  { platform: "browser", label: "Chrome or Edge", hint: "Browser extension", icon: AppWindow, os: "browser" },
] as const;

/** Big download buttons for the agent page. The detected OS comes first and is highlighted. */
export function AgentDownloads() {
  const os = useDetectedOs();
  const items = [...DOWNLOADS].sort((a, b) => Number(b.os === os) - Number(a.os === os));
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((d, i) => {
        const recommended = d.os === os && i === 0;
        return (
          <a
            key={d.platform}
            href={`/dashboard/agent/download/${d.platform}`}
            className={cn(
              "group flex items-center gap-3 rounded-field border px-4 py-3.5 transition-colors",
              recommended ? "border-white/50 bg-white/[0.06] hover:bg-white/[0.09]" : "border-line hover:border-white/25",
            )}
          >
            <d.icon className="size-5 shrink-0 text-fog" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{d.label}</span>
              <span className="block text-2xs text-mist">{recommended ? "Recommended for this computer" : d.hint}</span>
            </span>
            <Download className="size-4 text-mist transition-transform group-hover:translate-y-0.5" aria-hidden />
          </a>
        );
      })}
    </div>
  );
}

/** Sidebar control above Overview: one click downloads for this OS; other platforms in a menu. */
export function SidebarAgentDownload() {
  const os = useDetectedOs();
  const primary = os === "mac" ? DOWNLOADS[1] : DOWNLOADS[0];
  return (
    <div className="rounded-xl border border-line p-1">
      <a href={`/dashboard/agent/download/${primary.platform}`} className={buttonClasses("primary", "sm", "w-full")}>
        <Download className="size-3.5 shrink-0" aria-hidden />
        Download agent
        {os && <span className="sr-only"> for {os === "mac" ? "Mac" : "Windows"}</span>}
      </a>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1 pt-1.5 text-2xs text-mist hover:text-paper [&::-webkit-details-marker]:hidden">
          {os ? `For ${os === "mac" ? "Mac" : "Windows"} · ` : ""}Other platforms
        </summary>
        <ul className="mt-1 space-y-0.5 pb-1">
          {DOWNLOADS.filter((d) => d.platform !== primary.platform).map((d) => (
            <li key={d.platform}>
              <a href={`/dashboard/agent/download/${d.platform}`} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-fog hover:bg-white/[0.06] hover:text-paper">
                <d.icon className="size-3.5" aria-hidden />
                {d.label}
              </a>
            </li>
          ))}
          <li>
            <a href="/dashboard/agent" className="block rounded-lg px-2.5 py-1.5 text-xs text-fog hover:bg-white/[0.06] hover:text-paper">
              How it works and devices
            </a>
          </li>
        </ul>
      </details>
    </div>
  );
}

function useAction(fn: () => Promise<ActionState>, confirmText?: string) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>({});
  return {
    pending,
    state,
    run: () => {
      if (confirmText && !confirm(confirmText)) return;
      start(async () => setState(await fn()));
    },
  };
}

export function RevokeDeviceButton({ deviceId, name }: { deviceId: string; name: string }) {
  const { pending, state, run } = useAction(() => revokeDeviceAction(deviceId), `Remove HighPre Agent from ${name}? It will turn itself off.`);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="ghost" size="sm" onClick={run} disabled={pending}>
        {pending && <Spinner />}
        Remove
      </Button>
      {state.message && !state.ok && <FormMessage state={state} className="max-w-xs" />}
    </div>
  );
}

export function NotSensitiveButton({ alertId }: { alertId: string }) {
  const { pending, state, run } = useAction(() => markNotSensitiveAction(alertId));
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant="ghost" size="sm" onClick={run} disabled={pending}>
        {pending && <Spinner />}
        Not sensitive
      </Button>
      {state.message && !state.ok && <FormMessage state={state} className="max-w-xs" />}
    </div>
  );
}

type Option = { value: string; label: string };

/** What the organisation's agents and extensions watch for. */
export function AgentPolicyForm({
  dataTypes,
  apps,
  value,
}: {
  dataTypes: (Option & { hint: string })[];
  apps: readonly Option[];
  value: { dataTypes: string[]; allowedApps: string[]; extensionMode: "warn" | "block" };
}) {
  const { state, pending, formProps } = useActionForm(saveAgentPolicyAction);
  return (
    <form {...formProps} className="space-y-6">
      <fieldset>
        <legend className="mb-2.5 text-xs font-medium text-fog">Look for</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {dataTypes.map((d) => (
            <label key={d.value} className="flex cursor-pointer items-start gap-3 rounded-field border border-line px-3.5 py-2.5 hover:border-white/25">
              <input type="checkbox" name="dataTypes" value={d.value} defaultChecked={value.dataTypes.includes(d.value)} className="mt-0.5 size-4 shrink-0 accent-white" />
              <span className="min-w-0">
                <span className="block text-sm">{d.label}</span>
                <span className="block text-2xs text-mist">{d.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <ChoiceChips name="allowedApps" legend="Allowed tools (no warnings)" options={apps} defaultValue={value.allowedApps} />
        <p className="mt-2 text-2xs text-mist">Only tools your company pays for, like ChatGPT Enterprise.</p>
      </div>

      <fieldset>
        <legend className="mb-2.5 text-xs font-medium text-fog">When the browser extension spots something</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { v: "warn", label: "Warn and let them choose", hint: "You see what they chose." },
            { v: "block", label: "Block it", hint: "They can't paste or send it." },
          ].map((o) => (
            <label key={o.v} className="flex cursor-pointer items-start gap-3 rounded-field border border-line px-3.5 py-2.5 hover:border-white/25">
              <input type="radio" name="extensionMode" value={o.v} defaultChecked={value.extensionMode === o.v} className="mt-0.5 size-4 shrink-0 accent-white" />
              <span>
                <span className="block text-sm">{o.label}</span>
                <span className="block text-2xs text-mist">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingLabel="Saving…">Save settings</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Company installers for Intune, Jamf and similar, plus the switch and key rotation. */
export function CompanyInstall({ enabled }: { enabled: boolean }) {
  const toggle = useAction(() => setEnrollmentAction(!enabled), enabled ? "Turn off the company installer? Computers already set up keep working." : undefined);
  const rotate = useAction(rotateEnrollKeyAction, "Replace the key? The old installer stops working, so download and send the new one.");
  const state = rotate.state.message ? rotate.state : toggle.state;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {DOWNLOADS.filter((d) => d.platform !== "browser").map((d) => (
          <a key={d.platform} href={`/dashboard/agent/company/${d.platform}`} className="group flex items-center gap-3 rounded-field border border-line px-4 py-3 hover:border-white/25">
            <d.icon className="size-4 shrink-0 text-fog" aria-hidden />
            <span className="min-w-0 flex-1 text-sm">{d.label}</span>
            <Download className="size-4 text-mist transition-transform group-hover:translate-y-0.5" aria-hidden />
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-mist">Company installer is {enabled ? "on" : "off"}.</span>
        <Button variant="secondary" size="sm" onClick={toggle.run} disabled={toggle.pending}>
          {toggle.pending && <Spinner />}
          {enabled ? "Turn off" : "Turn on"}
        </Button>
        <Button variant="ghost" size="sm" onClick={rotate.run} disabled={rotate.pending}>
          {rotate.pending && <Spinner />}
          Replace key
        </Button>
      </div>
      {state.message && <FormMessage state={state} />}
    </div>
  );
}

export function AcknowledgeButton({ alertId, label = "Mark reviewed" }: { alertId: string | "all"; label?: string }) {
  const { pending, state, run } = useAction(() => acknowledgeAlertsAction(alertId === "all" ? "all" : [alertId]));
  return (
    <div className="flex flex-col items-end gap-2">
      <Button variant={alertId === "all" ? "secondary" : "ghost"} size="sm" onClick={run} disabled={pending}>
        {pending && <Spinner />}
        {label}
      </Button>
      {state.message && !state.ok && <FormMessage state={state} className="max-w-xs" />}
    </div>
  );
}
