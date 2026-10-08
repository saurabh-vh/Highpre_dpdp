"use client";

import { useEffect } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";

/** Shown when a page throws. The digest lets support find the server log entry. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <LogoMark className="mx-auto mb-8 h-10" />
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-mist">Nothing you entered has been lost. Try again, or come back in a minute.</p>
        {error.digest && <p className="mt-2 font-mono text-2xs text-mist">Reference: {error.digest}</p>}
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <ButtonLink href="/dashboard" variant="secondary">Go to dashboard</ButtonLink>
        </div>
      </div>
    </main>
  );
}
