import { PageHeader } from "@/components/ui/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { SettingsForm } from "@/features/settings/settings-form";
import { TwoFactorPolicyForm } from "@/features/settings/two-factor-policy-form";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";

export const metadata = { title: "Business settings" };

export default async function SettingsPage() {
  const { org, role } = await requireAuth();

  return (
    <>
      <PageHeader title="Business settings" description="Details that appear in your privacy notices and request pages." />
      <Panel>
        <PanelBody>
          <SettingsForm
            readOnly={!can(role, "settings")}
            org={{
              name: org.name,
              legalName: org.legalName,
              address: org.address,
              grievanceOfficerName: org.grievanceOfficerName,
              grievanceEmail: org.grievanceEmail,
              grievancePhone: org.grievancePhone,
              responseDays: org.responseDays,
            }}
          />
        </PanelBody>
      </Panel>
      <Panel className="mt-6">
        <PanelHeader title="Sign-in security" description={role === "owner" ? undefined : "Only an owner can change this."} />
        <PanelBody>
          <TwoFactorPolicyForm required={Boolean(org.requireTwoFactor)} readOnly={role !== "owner"} />
        </PanelBody>
      </Panel>
    </>
  );
}
