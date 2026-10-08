import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { ResetPasswordForm } from "@/features/auth/password-reset-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell asideTitle="Almost there." asideBody="Choose a new password to get back into your account.">
      <AuthHeading title="Choose a new password" subtitle="You'll use it the next time you log in." />
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-mist">
          This link is incomplete. <Link href="/forgot-password" className="text-paper underline underline-offset-4">Request a new one</Link>.
        </p>
      )}
    </AuthShell>
  );
}
