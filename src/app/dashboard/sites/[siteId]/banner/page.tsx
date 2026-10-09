import { InstallIllustration } from "@/components/illustrations/feature-illustrations";
import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { BannerSettings } from "@/features/banner/banner-settings";
import { requireSite } from "@/lib/auth/guards";
import { siteScriptTag } from "@/lib/consent/site-script";
import { env } from "@/lib/env";
import { relativeDays } from "@/lib/format";
import { normalizeLanguages } from "@/lib/i18n/languages";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Consent banner" };

export default async function BannerPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await requireSite(siteId);
  // One line runs everything; what it shows is controlled from this dashboard.
  const snippet = siteScriptTag(env().APP_URL, site.siteKey);
  const blockingExample = `<!-- Before: loads immediately -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>

<!-- After: waits for "analytics" consent -->
<script type="text/plain" data-hp-purpose="analytics" async
  src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>`;

  const published = (site.publishedNoticeVersion ?? 0) > 0;
  const signals = Boolean(site.banner.googleConsentMode || site.banner.metaPixelConsent);
  const features = [
    { label: "Cookie banner", on: published, href: published ? null : `/dashboard/sites/${site.id}/notice`, hint: published ? "On" : "Publish your notice first" },
    { label: "Checkboxes on your forms", on: Boolean(site.forms?.autoProtect), href: `/dashboard/sites/${site.id}/forms`, hint: site.forms?.autoProtect ? "On" : "Off" },
    { label: "Privacy badge", on: Boolean(site.privacyCentre?.badge?.enabled), href: `/dashboard/sites/${site.id}/settings`, hint: site.privacyCentre?.badge?.enabled ? "On" : "Off" },
    { label: "Google and Meta ads", on: signals, href: null, hint: signals ? "On" : "Off, see below" },
  ];

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Add HighPre to your website"
          description="Copy this line into your website's <head> section. You only do this once."
          action={
            site.widgetLastSeenAt ? (
              <Badge tone="success">Detected {relativeDays(site.widgetLastSeenAt)}</Badge>
            ) : (
              <Badge tone="warning">Not detected yet</Badge>
            )
          }
        />
        <PanelBody className="space-y-4">
          {!published && (
            <Callout tone="warning" action={<ButtonLink href={`/dashboard/sites/${site.id}/notice`} size="sm" variant="secondary">Publish notice</ButtonLink>}>
              The banner stays hidden until you publish a privacy notice, so visitors always see what they&apos;re agreeing to.
            </Callout>
          )}
          {site.children?.enabled && (
            <Callout tone="info">
              The age check is on: visitors are asked whether they&apos;re 18 or older before choosing, and under-18s are sent to a parent consent page.
            </Callout>
          )}
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col gap-3 rounded-field bg-black/50 p-4 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-fog">{snippet}</code>
                <CopyButton value={snippet} label="Copy" />
              </div>
              <p className="text-2xs text-mist">Using Google Analytics or a Meta Pixel? Put this line above them. Everything below turns on and off from here.</p>
            </div>
            <InstallIllustration className="md:w-60" />
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {features.map((f) => {
              const body = (
                <>
                  <span className={f.on ? "size-2 shrink-0 rounded-full bg-success" : "size-2 shrink-0 rounded-full bg-white/20"} aria-hidden />
                  <span className="min-w-0 flex-1 text-sm">{f.label}</span>
                  <span className="text-2xs text-mist">{f.hint}</span>
                </>
              );
              return (
                <li key={f.label}>
                  {f.href ? (
                    <a href={f.href} className="flex items-center gap-3 rounded-field border border-line px-4 py-3 transition-colors hover:border-white/25">{body}</a>
                  ) : (
                    <div className="flex items-center gap-3 rounded-field border border-line px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>

          {!signals && (
            <details className="rounded-field border border-line px-4 py-3">
              <summary className="cursor-pointer text-xs text-fog">Advanced: block a script until people agree</summary>
              <div className="mt-4 space-y-3 text-xs text-mist">
                <p>Change the script like this. It only runs after the visitor says yes.</p>
                <pre className="overflow-x-auto rounded-field bg-black/50 p-4 font-mono leading-relaxed text-fog">{blockingExample}</pre>
                <p>
                  Your purpose keys: {site.purposes.map((p) => <code key={p.key} className="mr-2 font-mono text-paper">{p.key}</code>)}
                </p>
              </div>
            </details>
          )}
        </PanelBody>
      </Panel>

      <BannerSettings
        siteId={site.id}
        banner={site.banner as Parameters<typeof BannerSettings>[0]["banner"]}
        purposes={site.purposes.map((p) => ({ key: p.key, name: p.name, essential: p.essential }))}
        languages={normalizeLanguages(site.languages)}
        brand={site.brand ? { primary: site.brand.primary, background: site.brand.background, text: site.brand.text, font: site.brand.font } : null}
      />
    </div>
  );
}
