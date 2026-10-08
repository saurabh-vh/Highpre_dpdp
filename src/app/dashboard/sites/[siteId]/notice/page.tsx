import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { NoticeDocument } from "@/components/consent/notice-document";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { CopyButton } from "@/components/ui/copy-button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Segmented } from "@/components/ui/segmented";
import { PublishNoticeButton } from "@/features/notices/publish-button";
import { requireAuth, requireSite } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { nativeName } from "@/lib/i18n/languages";
import { generateNotice } from "@/lib/notice/generate";
import { noticeInputFor, publishableLanguages } from "@/lib/notice/input";
import { Notice } from "@/models";

export const metadata = { title: "Privacy notice" };

export default async function NoticePage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const [{ org, role, plan }, site] = await Promise.all([requireAuth(), requireSite(siteId)]);
  const versions = await Notice.find({ siteId: site._id }).sort({ version: -1 }).select("version createdAt languages").lean();

  const nextVersion = (site.publishedNoticeVersion ?? 0) + 1;
  const publicUrl = `${env().APP_URL}/p/${site.siteKey}/notice`;
  const rightsUrl = `${env().APP_URL}/p/${site.siteKey}/rights`;
  const { languages, dropped } = publishableLanguages(site.languages, plan.limits.languages);
  const draft = generateNotice(noticeInputFor(org, site, nextVersion), languages);
  const canPublish = can(role, "notice.publish");

  const blockers = [
    site.purposes.length === 0 && { text: "Add at least one purpose to the data inventory.", href: `/dashboard/sites/${site.id}/inventory`, cta: "Open inventory" },
    !org.grievanceEmail && { text: "Add a grievance contact. It must appear in your notice.", href: "/dashboard/settings", cta: "Open settings" },
  ].filter(Boolean) as { text: string; href: string; cta: string }[];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Panel>
        <PanelHeader
          title={`Draft for version ${nextVersion}`}
          description="Generated from your data inventory and business settings. Have a lawyer review the wording before you rely on it."
          action={canPublish && <PublishNoticeButton siteId={site.id} nextVersion={nextVersion} disabled={blockers.length > 0} />}
        />
        <PanelBody>
          {blockers.length > 0 && (
            <div className="mb-6 space-y-2">
              {blockers.map((b) => (
                <Callout key={b.text} tone="warning" action={<ButtonLink href={b.href} size="sm" variant="secondary">{b.cta}</ButtonLink>}>
                  {b.text}
                </Callout>
              ))}
            </div>
          )}
          {dropped.length > 0 && (
            <Callout tone="info" className="mb-6">
              Your {plan.name} plan includes {plan.limits.languages} languages, so {dropped.map(nativeName).join(", ")} won&apos;t be published.
            </Callout>
          )}
          <Segmented
            label="Notice language"
            items={languages.map((lang) => ({
              id: lang,
              label: nativeName(lang),
              content: <NoticeDocument content={draft[lang]!} lang={lang} />,
            }))}
          />
        </PanelBody>
      </Panel>

      <div className="space-y-6 self-start">
        <Panel>
          <PanelHeader title="Public links" description="Link both from your website footer." />
          <PanelBody className="space-y-4">
            {versions.length > 0 ? (
              <>
                <PublicLink label="Privacy notice" url={publicUrl} />
                <PublicLink label="Data request page" url={rightsUrl} />
              </>
            ) : (
              <p className="text-xs text-mist">Available after you publish.</p>
            )}
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Version history" description="Every consent record points to one of these." />
          {versions.length === 0 ? (
            <PanelBody><p className="text-xs text-mist">Nothing published yet.</p></PanelBody>
          ) : (
            <ul className="divide-y divide-white/[0.08]">
              {versions.map((v) => (
                <li key={v.version}>
                  <Link href={`/p/${site.siteKey}/notice?v=${v.version}`} target="_blank" className="flex items-center justify-between gap-3 px-6 py-3.5 text-xs transition-colors hover:bg-white/[0.03]">
                    <span>
                      <span className="block font-medium">Version {v.version}</span>
                      <span className="block text-2xs text-mist">{(v.languages ?? ["en", "hi"]).length} languages</span>
                    </span>
                    <span className="text-mist">{formatDateTime(v.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function PublicLink({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="mb-1.5 text-2xs font-medium text-mist">{label}</p>
      <div className="flex items-center gap-2">
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1 text-xs text-paper underline decoration-white/30 underline-offset-4">
          <span className="truncate">{url}</span>
          <ArrowUpRight className="size-3.5 shrink-0" aria-hidden />
        </a>
        <CopyButton value={url} label="Copy" />
      </div>
    </div>
  );
}
