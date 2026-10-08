import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/password-reset-forms";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell asideTitle="It happens." asideBody="We'll email you a link to choose a new password.">
      <AuthHeading title="Reset your password" subtitle="Enter the email you signed up with." />
      <ForgotPasswordForm />
    </AuthShell>
  );
}
