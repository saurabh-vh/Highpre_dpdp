import { ArrowUpRight } from "lucide-react";
import { SiteTabs } from "@/components/dashboard/site-tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { requireSite } from "@/lib/auth/guards";
import { hostnameOf } from "@/lib/format";

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await requireSite(siteId);
  const published = (site.publishedNoticeVersion ?? 0) > 0;

  return (
    <>
      <PageHeader
        back={{ href: "/dashboard/sites", label: "Websites" }}
        title={site.name}
        description={
          <a href={site.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 transition-colors hover:text-paper">
            {hostnameOf(site.url)}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        }
        actions={
          <>
            {published ? <Badge tone="success">Notice v{site.publishedNoticeVersion} live</Badge> : <Badge tone="warning">No notice yet</Badge>}
            {site.widgetLastSeenAt ? <Badge tone="success">Banner installed</Badge> : <Badge tone="muted">Banner not detected</Badge>}
          </>
        }
      />
      <SiteTabs
        siteId={site.id}
        steps={[
          { segment: "", label: "Scan", done: Boolean(site.lastScanId) },
          { segment: "/inventory", label: "Data inventory", done: site.purposes.length > 0 },
          { segment: "/notice", label: "Privacy notice", done: published },
          { segment: "/banner", label: "Consent banner", done: Boolean(site.widgetLastSeenAt) },
        ]}
        extras={[
          { segment: "/forms", label: "Forms" },
          { segment: "/consents", label: "Consent records" },
          { segment: "/analytics", label: "Analytics" },
          { segment: "/settings", label: "Settings" },
        ]}
      />
      {children}
    </>
  );
}
