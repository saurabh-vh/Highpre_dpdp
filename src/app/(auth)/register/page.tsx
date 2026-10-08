import type { Metadata } from "next";
import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { RegisterForm } from "@/features/auth/register-form";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <AuthShell asideTitle="Ready before May 2027." asideBody="Scan your site, publish a notice and start recording consent today.">
      <AuthHeading title="Create your account" subtitle="Free for one website. No card needed." />
      <RegisterForm />
    </AuthShell>
  );
}
