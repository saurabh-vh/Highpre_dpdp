import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { DeleteSiteForm } from "@/features/sites/delete-site-form";
import { ChildrenForm, LanguagesForm, SiteDetailsForm } from "@/features/sites/site-settings-forms";
import { requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { normalizeLanguages } from "@/lib/i18n/languages";

export const metadata = { title: "Website settings" };

export default async function SiteSettingsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [{ role, plan }, site] = await Promise.all([requireAuth(), requireSite(siteId)]);
  const canManage = can(role, "sites.manage");
  const canPublish = can(role, "notice.publish");

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Languages" description="Your notice, consent banner and request pages are offered in these languages. Visitors see their browser's language when it's available." />
        <PanelBody>
          <LanguagesForm siteId={site.id} selected={normalizeLanguages(site.languages)} max={plan.limits.languages} readOnly={!canPublish} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Children's data" description="Turn this on if people under 18 may use your website, for example schools, coaching, games or youth products." />
        <PanelBody>
          <ChildrenForm siteId={site.id} enabled={Boolean(site.children?.enabled)} readOnly={!canPublish} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Website details" />
        <PanelBody>
          <SiteDetailsForm siteId={site.id} name={site.name} url={site.url} readOnly={!canManage} />
        </PanelBody>
      </Panel>

      {canManage && (
        <Panel className="border-danger/25">
          <PanelHeader title="Remove this website" description="Deletes its scans, notices, consent records and data requests. This can't be undone. Export your consent records first." />
          <PanelBody>
            <DeleteSiteForm siteId={site.id} siteName={site.name} />
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
