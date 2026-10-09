import { MonitoringIllustration } from "@/components/illustrations/feature-illustrations";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { DeleteSiteForm } from "@/features/sites/delete-site-form";
import { PrivacyCentreForm, PrivacyCentreLinks } from "@/features/sites/privacy-centre-settings";
import { ChildrenForm, LanguagesForm, MonitoringForm, SiteDetailsForm } from "@/features/sites/site-settings-forms";
import { requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
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
        <PanelHeader title="Privacy centre" description="A public page for your visitors that brings your notice, data requests, contacts and trackers together." />
        <PanelBody className="space-y-6">
          {(site.publishedNoticeVersion ?? 0) === 0 && (
            <Callout tone="warning">The privacy centre goes live once you publish a privacy notice.</Callout>
          )}
          <PrivacyCentreLinks
            url={`${env().APP_URL}/p/${site.siteKey}`}
            live={(site.publishedNoticeVersion ?? 0) > 0 && site.privacyCentre?.enabled !== false}
          />
          <PrivacyCentreForm
            siteId={site.id}
            enabled={site.privacyCentre?.enabled !== false}
            showVendors={Boolean(site.privacyCentre?.showVendors)}
            badge={{
              enabled: Boolean(site.privacyCentre?.badge?.enabled),
              placement: site.privacyCentre?.badge?.placement === "corner" ? "corner" : "footer",
              theme: site.privacyCentre?.badge?.theme === "dark" ? "dark" : "light",
              size: site.privacyCentre?.badge?.size === "small" ? "small" : "regular",
            }}
            badgeUrl={`${env().APP_URL}/p/${site.siteKey}/badge.svg`}
            centreUrl={`${env().APP_URL}/p/${site.siteKey}`}
            readOnly={!canPublish}
          />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Weekly monitoring" description="HighPre rescans the website automatically and tells you what changed since the previous scan." />
        <PanelBody>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <MonitoringForm siteId={site.id} enabled={site.monitoring?.enabled !== false} readOnly={!canManage} />
            </div>
            <MonitoringIllustration className="sm:w-56" />
          </div>
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
