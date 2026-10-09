import { SectionTabs } from "@/components/dashboard/section-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { AgentAlert } from "@/models";

/** The Desktop agent section: get started, alerts, computers and (for owners and admins) settings. */
export default async function AgentLayout({ children }: { children: React.ReactNode }) {
  const { org, user, role } = await requireAuth();
  const manager = can(role, "team");
  const openAlerts = await AgentAlert.countDocuments({ orgId: org._id, acknowledgedAt: { $exists: false }, ...(manager ? {} : { userId: user.id }) });

  return (
    <>
      <PageHeader
        title="Desktop agent"
        description="Stops your team from pasting passwords, card numbers and other private data into ChatGPT, WhatsApp and similar apps by mistake."
      />
      <SectionTabs
        label="Desktop agent sections"
        tabs={[
          { href: "/dashboard/agent", label: "Get started" },
          { href: "/dashboard/agent/alerts", label: "Alerts", count: openAlerts },
          { href: "/dashboard/agent/computers", label: "Computers" },
          ...(manager ? [{ href: "/dashboard/agent/settings", label: "Settings" }] : []),
        ]}
      />
      {children}
    </>
  );
}
