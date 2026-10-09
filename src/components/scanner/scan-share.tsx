"use client";

import { CheckCircle2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { MARKETING_CONSENT } from "@/lib/public-scan/constants";

type Status = { state: "idle" } | { state: "sending" } | { state: "sent"; email: string } | { state: "error"; message: string };

/** Share link and "Email me the PDF" for a stored public scan report. */
export function ScanShare({ reportId }: { reportId: string }) {
  const [origin, setOrigin] = useState("");
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const path = `/scan/r/${reportId}`;

  useEffect(() => setOrigin(window.location.origin), []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus({ state: "sending" });
    try {
      const res = await fetch("/api/public/scan/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, email, marketing }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "We couldn't send the report. Try again.");
      setStatus({ state: "sent", email: email.trim() });
    } catch (err) {
      setStatus({ state: "error", message: (err as Error).message });
    }
  }

  return (
    <section className="glass rounded-panel p-6 sm:p-8">
      <h2 className="text-sm font-semibold">Keep this report</h2>
      <div className="mt-5">
        <p className="text-xs font-medium text-fog">Share link</p>
        <div className="mt-2 flex flex-col gap-3 rounded-field bg-black/50 p-3 sm:flex-row sm:items-center">
          <a href={path} className="min-w-0 flex-1 truncate font-mono text-xs text-fog underline-offset-4 hover:underline">
            {origin}
            {path}
          </a>
          <CopyButton value={`${origin}${path}`} label="Copy link" />
        </div>
        <p className="mt-2 text-2xs text-mist">Anyone with the link can view it for 30 days. It isn&apos;t listed in search engines.</p>
      </div>

      <div className="mt-8 border-t border-white/[0.08] pt-6">
        {status.state === "sent" ? (
          <p className="flex items-start gap-3 text-sm" role="status">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" strokeWidth={1.6} aria-hidden />
            <span>
              Sent to {status.email}. Check your inbox for the PDF in a minute or two.
            </span>
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <label htmlFor="scan-report-email" className="block text-xs font-medium text-fog">
              Email me the PDF report
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                id="scan-report-email"
                type="email"
                autoComplete="email"
                placeholder="you@yourbusiness.in"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={status.state === "error" ? true : undefined}
                aria-describedby={status.state === "error" ? "scan-report-error" : "scan-report-hint"}
                required
                className="sm:flex-1"
              />
              <Button type="submit" size="lg" className="h-12" disabled={status.state === "sending" || !email.trim()}>
                {status.state === "sending" ? "Sending…" : "Email PDF"}
              </Button>
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-xs text-fog">
              <input
                type="checkbox"
                checked={marketing}
                onChange={(e) => setMarketing(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-white"
              />
              <span>{MARKETING_CONSENT.text}. Optional; you can unsubscribe anytime.</span>
            </label>
            {status.state === "error" ? (
              <p id="scan-report-error" role="alert" className="text-xs text-danger">
                {status.message}
              </p>
            ) : (
              <p id="scan-report-hint" className="text-2xs leading-relaxed text-mist">
                We use your email to send this report. We only send product updates if you tick the box. See our{" "}
                <a href="/privacy" className="underline underline-offset-4 hover:text-paper">privacy notice</a>.
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
