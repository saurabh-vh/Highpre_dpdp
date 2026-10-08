import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { AuthHeading, AuthShell } from "@/features/auth/auth-shell";
import { logoutAction } from "@/features/auth/actions";
import { AcceptInviteButton, AcceptInviteSignup } from "@/features/team/accept-invite";
import { readSession } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { sha256 } from "@/lib/crypto";
import { connectDb } from "@/lib/db";
import { Invite, Organization, User } from "@/models";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await connectDb();
  const invite = await Invite.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean();
  const org = invite ? await Organization.findById(invite.orgId).select("name").lean() : null;

  if (!invite || !org) {
    return (
      <AuthShell asideTitle="Invitations expire." asideBody="For security, links are valid for 7 days and only work once.">
        <AuthHeading title="This invitation isn't valid" subtitle="It may have expired, been used already, or been revoked. Ask the person who invited you to send a new one." />
        <ButtonLink href="/login" variant="secondary" className="w-full">Go to log in</ButtonLink>
      </AuthShell>
    );
  }

  const session = await readSession();
  const sessionUser = session ? await User.findById(session.uid).select("email").lean() : null;
  const existing = await User.exists({ email: invite.email });
  const role = ROLE_LABELS[invite.role].toLowerCase();

  return (
    <AuthShell asideTitle={`Join ${org.name}.`} asideBody="Work together on notices, consent records, data requests and breach response.">
      <AuthHeading title={`Join ${org.name}`} subtitle={`You've been invited as ${role === "admin" ? "an" : "a"} ${role}.`} />
      {sessionUser?.email === invite.email ? (
        <AcceptInviteButton token={token} orgName={org.name} />
      ) : sessionUser ? (
        <div className="space-y-4 text-sm text-fog">
          <p>
            You&apos;re logged in as <strong className="text-paper">{sessionUser.email}</strong>, but this invitation is for{" "}
            <strong className="text-paper">{invite.email}</strong>.
          </p>
          <form action={logoutAction}>
            <button type="submit" className="text-paper underline underline-offset-4">Log out and continue</button>
          </form>
        </div>
      ) : existing ? (
        <div className="space-y-4">
          <p className="text-sm text-fog">You already have a HighPre account with {invite.email}. Log in to accept.</p>
          <ButtonLink href={`/login?next=${encodeURIComponent(`/invite/${token}`)}`} size="lg" className="w-full">Log in to accept</ButtonLink>
        </div>
      ) : (
        <AcceptInviteSignup token={token} email={invite.email} />
      )}
    </AuthShell>
  );
}
