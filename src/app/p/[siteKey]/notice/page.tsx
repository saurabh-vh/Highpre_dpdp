import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoticeDocument } from "@/components/consent/notice-document";
import { connectDb } from "@/lib/db";
import { LANG_CODES, nativeName, pickLang } from "@/lib/i18n/languages";
import type { NoticeLanguageContent } from "@/lib/notice/generate";
import { cn } from "@/lib/utils";
import { Notice, Site } from "@/models";

type Props = { params: Promise<{ siteKey: string }>; searchParams: Promise<{ lang?: string; v?: string }> };

async function load({ params, searchParams }: Props) {
  const [{ siteKey }, { lang, v }] = await Promise.all([params, searchParams]);
  await connectDb();
  const site = await Site.findOne({ siteKey }).select("name publishedNoticeVersion").lean();
  if (!site || !site.publishedNoticeVersion) return null;
  const version = Number(v) > 0 ? Number(v) : site.publishedNoticeVersion;
  const notice = await Notice.findOne({ siteId: site._id, version }).lean();
  if (!notice) return null;
  // Older notices were stored before the `languages` field existed.
  const available = LANG_CODES.filter((l) => notice.content?.[l]);
  return { site, notice, siteKey, available, language: pickLang(lang, available), isLatest: version === site.publishedNoticeVersion };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  return { title: data ? `Privacy notice, ${data.site.name}` : "Privacy notice" };
}

export default async function PublicNoticePage(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { notice, siteKey, language, available, isLatest } = data;
  const content = notice.content[language] as NoticeLanguageContent;
  const versionQuery = isLatest ? "" : `&v=${notice.version}`;

  return (
    <>
      {available.length > 1 && (
        <nav aria-label="Language" className="mb-12 inline-flex max-w-full flex-wrap gap-1 rounded-[20px] border border-white/10 bg-white/[0.04] p-1">
          {available.map((l) => (
            <Link
              key={l}
              href={`/p/${siteKey}/notice?lang=${l}${versionQuery}`}
              aria-current={language === l ? "page" : undefined}
              lang={l}
              className={cn("rounded-full px-4 py-1.5 text-xs font-medium transition-colors", language === l ? "bg-paper text-ink" : "text-fog hover:text-paper")}
            >
              {nativeName(l)}
            </Link>
          ))}
        </nav>
      )}
      {!isLatest && (
        <p className="mb-8 rounded-field border border-white/25 px-4 py-3 text-xs">
          You&apos;re viewing an earlier version.{" "}
          <Link href={`/p/${siteKey}/notice?lang=${language}`} className="underline underline-offset-4">See the current notice</Link>.
        </p>
      )}
      <NoticeDocument content={content} lang={language} />
    </>
  );
}
