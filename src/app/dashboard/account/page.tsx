import QRCode from "qrcode";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";
import { logoutEverywhereAction } from "@/features/account/actions";
import { PasswordForm, ProfileForm } from "@/features/account/account-forms";
import { TwoFactorPanel } from "@/features/account/two-factor-panel";
import { requireAuthWithoutPolicy } from "@/lib/auth/guards";
import { formatTotpKey, otpauthUrl } from "@/lib/auth/totp";
import { decryptSecret } from "@/lib/crypto";
import { formatDate } from "@/lib/format";
import { User } from "@/models";

export const metadata = { title: "Your account" };

/** Setup details for a pending authenticator secret; the QR code is rendered here as an SVG data URL. */
async function setupDetails(encrypted: string | null | undefined, email: string) {
  if (!encrypted) return undefined;
  let secret: string;
  try {
    secret = decryptSecret(encrypted);
  } catch {
    return undefined;
  }
  const uri = otpauthUrl({ secret, account: email });
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).catch(() => null);
  return { qr: svg ? `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` : null, key: formatTotpKey(secret), secret, uri };
}

export default async function AccountPage() {
  // Without the 2FA policy: this is where owners/admins are sent to turn it on.
  const { user, org, mustEnableTwoFactor } = await requireAuthWithoutPolicy();
  const doc = await User.findById(user.id).select("+totpPendingSecret +recoveryCodeHashes twoFactorEnabled twoFactorEnabledAt").lean();
  const setup = doc?.twoFactorEnabled ? undefined : await setupDetails(doc?.totpPendingSecret, user.email);
  const status = doc?.twoFactorEnabled ? "on" : setup ? "pending" : "off";

  return (
    <>
      <PageHeader title="Your account" description="Your login details. Business details are under Settings." />
      <div className="space-y-6">
        {mustEnableTwoFactor && (
          <Callout tone="warning" title="Turn on two-factor sign-in to continue">
            {org.name} requires two-factor sign-in for owners and admins. Set it up below to get back to the rest of the dashboard.
          </Callout>
        )}
        <Panel>
          <PanelHeader title="Profile" />
          <PanelBody>
            <ProfileForm name={user.name} email={user.email} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Password" description="Changing it signs you out on every other device." />
          <PanelBody>
            <PasswordForm />
          </PanelBody>
        </Panel>
        <Panel id="two-factor">
          <PanelHeader title="Two-factor sign-in" description="Ask for a code from an authenticator app after your password, so a leaked password alone can't get in." />
          <PanelBody>
            <TwoFactorPanel
              status={status}
              setup={setup}
              enabledAt={doc?.twoFactorEnabledAt ? formatDate(doc.twoFactorEnabledAt) : undefined}
              codesLeft={doc?.recoveryCodeHashes?.length ?? 0}
            />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader
            title="Sign out everywhere"
            description="Ends every session, including this one. Use it if you lost a device or shared your login."
            action={
              <form action={logoutEverywhereAction}>
                <SubmitButton variant="outline" size="sm">Sign out everywhere</SubmitButton>
              </form>
            }
          />
        </Panel>
      </div>
    </>
  );
}
