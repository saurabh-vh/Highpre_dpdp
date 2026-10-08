import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const { next, reset } = await searchParams;
  return (
    <AuthShell asideTitle="Welcome back." asideBody="Your notices, consent records and data requests are where you left them.">
      <AuthHeading title="Log in" subtitle="Pick up where you left off." />
      <LoginForm next={next} notice={reset ? "Password updated. Log in with your new password." : undefined} />
    </AuthShell>
  );
}
