import type { Metadata } from "next";
import { Sidebar } from "@/components/dashboard/sidebar";
import { requireAuthWithoutPolicy } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { AgentAlert, Breach, Organization, RightsRequest, Site } from "@/models";

export const metadata: Metadata = { title: { default: "Dashboard", template: "%s · HighPre" }, robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Pages apply the two-factor policy themselves; the frame must render for the Account page too.
  const { user, org, role, plan } = await requireAuthWithoutPolicy();
  const [openRequests, openBreaches, orgs, openAlerts, sites] = await Promise.all([
    RightsRequest.countDocuments({ orgId: org._id, status: { $in: ["open", "in_progress"] } }),
    Breach.countDocuments({ orgId: org._id, closedAt: { $exists: false } }),
    Organization.find({ "members.userId": user.id }).select("name").sort({ name: 1 }).lean(),
    AgentAlert.countDocuments({ orgId: org._id, acknowledgedAt: { $exists: false }, ...(can(role, "team") ? {} : { userId: user.id }) }),
    Site.find({ orgId: org._id }).select("name favicon.contentType").sort({ createdAt: 1 }).lean(),
  ]);

  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar
        user={{ name: user.name, email: user.email }}
        org={{ id: org.id, name: org.name, planName: plan.name, paid: plan.id !== "free" }}
        orgs={orgs.map((o) => ({ id: String(o._id), name: o.name }))}
        role={role}
        counts={{ openRequests, openBreaches, openAlerts }}
        sites={sites.map((s) => ({ id: String(s._id), name: s.name, hasFavicon: Boolean(s.favicon?.contentType) }))}
      />
      <main className="px-4 pb-20 pt-8 sm:px-8 lg:ml-64 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
