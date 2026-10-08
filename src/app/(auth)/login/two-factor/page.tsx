import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { TwoFactorLoginForm } from "@/features/auth/two-factor-login-form";
import { readPending2fa } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Two-factor sign-in", robots: { index: false } };

export default async function TwoFactorLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only reachable straight after a correct password (the pending cookie lasts 5 minutes).
  if (!(await readPending2fa())) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return (
    <AuthShell asideTitle="One more step." asideBody="Two-factor sign-in keeps your consent records and data requests safe, even if your password leaks.">
      <AuthHeading title="Enter your code" subtitle="Open your authenticator app and enter the 6-digit code for HighPre." />
      <TwoFactorLoginForm next={next} />
    </AuthShell>
  );
}
