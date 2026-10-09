import { CopyButton } from "@/components/ui/copy-button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { BannerSettings } from "@/features/banner/banner-settings";
import { requireSite } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { relativeDays } from "@/lib/format";
import { normalizeLanguages } from "@/lib/i18n/languages";
import { Callout } from "@/components/ui/callout";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Consent banner" };

export default async function BannerPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await requireSite(siteId);
  const snippet = `<script src="${env().APP_URL}/widget.js" data-hp-site="${site.siteKey}" async></script>`;
  const blockingExample = `<!-- Before: loads immediately -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>

<!-- After: waits for "analytics" consent -->
<script type="text/plain" data-hp-purpose="analytics" async
  src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>`;

  const published = (site.publishedNoticeVersion ?? 0) > 0;
  const consentMode = Boolean(site.banner.googleConsentMode);
  const signals = consentMode || Boolean(site.banner.metaPixelConsent);
  // Consent Mode needs HighPre to run first and synchronously, so its "denied" defaults beat the Google tag.
  const orderedSnippet = `<!-- 1. HighPre first, without async: sets consent defaults before any tag runs -->
<script src="${env().APP_URL}/widget.js" data-hp-site="${site.siteKey}"${consentMode ? " data-hp-consent-mode" : ""}></script>
${
  consentMode
    ? `
<!-- 2. Then your Google tag (or the Google Tag Manager snippet) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXX');
</script>
`
    : ""
}${
  site.banner.metaPixelConsent
    ? `
<!-- ${consentMode ? "3" : "2"}. Then your Meta Pixel base code, exactly as Meta gives it -->
`
    : ""
}`;

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Install on your website"
          description="Paste this just before the closing </head> tag on every page."
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
          <div className="flex flex-col gap-3 rounded-field bg-black/50 p-4 sm:flex-row sm:items-center">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-fog">{snippet}</code>
            <CopyButton value={snippet} label="Copy snippet" />
          </div>
          {signals && (
            <div className="space-y-3 rounded-field border border-line p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="text-xs text-mist">
                  <p className="text-sm text-paper">{consentMode ? "Google Consent Mode is on" : "Meta Pixel consent is on"}: put HighPre first</p>
                  <p className="mt-1">
                    Use this order in your <code className="font-mono text-paper">&lt;head&gt;</code>: the HighPre script without{" "}
                    <code className="font-mono text-paper">async</code>, then your tags. Don&apos;t hold these tags back with{" "}
                    <code className="font-mono text-paper">text/plain</code>; the consent signals control them.
                  </p>
                </div>
                <CopyButton value={orderedSnippet} label="Copy in order" />
              </div>
              <pre className="overflow-x-auto rounded-field bg-black/50 p-4 font-mono text-xs leading-relaxed text-fog">{orderedSnippet}</pre>
            </div>
          )}
          <details className="rounded-field border border-line px-4 py-3">
            <summary className="cursor-pointer text-xs text-fog">Hold back trackers until people consent</summary>
            <div className="mt-4 space-y-3 text-xs text-mist">
              <p>
                Change each tracking script&apos;s <code className="font-mono text-paper">type</code> to{" "}
                <code className="font-mono text-paper">text/plain</code> and add the purpose key from your inventory. The banner switches it on only after the visitor agrees.
              </p>
              <pre className="overflow-x-auto rounded-field bg-black/50 p-4 font-mono leading-relaxed text-fog">{blockingExample}</pre>
              <p>
                Your purpose keys: {site.purposes.map((p) => <code key={p.key} className="mr-2 font-mono text-paper">{p.key}</code>)}
              </p>
            </div>
          </details>
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
