import { connectDb } from "@/lib/db";
import { env } from "@/lib/env";
import { json, limitOrNull, preflight } from "@/lib/http";
import { getLocale, nativeName, purposeText, type WidgetStrings } from "@/lib/i18n";
import { en } from "@/lib/i18n/locales/en";
import { isTracking } from "@/lib/constants";
import { formsConfig } from "@/lib/consent/forms";
import { bannerLayout, safeFontFamily } from "@/lib/banner-layout";
import { isHex } from "@/lib/color";
import { resolveConsentTypes } from "@/lib/consent-mode";
import { Notice, Site } from "@/models";

export const dynamic = "force-dynamic";
export const OPTIONS = preflight;

/** Banner configuration consumed by widget.js on customer websites. */
export async function GET(req: Request, { params }: { params: Promise<{ siteKey: string }> }) {
  const limited = await limitOrNull(req, "config", 120, 60_000, true);
  if (limited) return limited;

  const { siteKey } = await params;
  await connectDb();
  const site = await Site.findOne({ siteKey }).select("purposes banner publishedNoticeVersion widgetLastSeenAt children forms").lean();
  if (!site) return json({ error: "Unknown site" }, { status: 404, cors: true });

  // Record that the widget is installed, at most once an hour.
  const hourAgo = new Date(Date.now() - 3_600_000);
  if (!site.widgetLastSeenAt || site.widgetLastSeenAt < hourAgo) {
    await Site.updateOne({ _id: site._id }, { widgetLastSeenAt: new Date() });
  }

  const version = site.publishedNoticeVersion ?? 0;
  // Offer exactly the languages of the published notice, so every link has a translation.
  const notice = version ? await Notice.findOne({ siteId: site._id, version }).select("languages content").lean() : null;
  const languages = notice ? (notice.languages?.length ? notice.languages : Object.keys(notice.content ?? {})) : ["en"];

  // Untouched default wording is shown translated; custom wording is shown as written.
  const customTitle = site.banner.title !== en.widget.defaultTitle ? site.banner.title : null;
  const customMessage = site.banner.message !== en.widget.defaultMessage ? site.banner.message : null;
  const strings: Record<string, WidgetStrings> = {};
  for (const lang of languages) {
    const w = getLocale(lang).widget;
    strings[lang] = { ...w, defaultTitle: customTitle ?? w.defaultTitle, defaultMessage: customMessage ?? w.defaultMessage };
  }

  const base = env().APP_URL;
  return json(
    {
      ready: version > 0,
      version,
      banner: {
        position: site.banner.position,
        theme: site.banner.theme,
        showReopenButton: site.banner.showReopenButton,
        defaultLanguage: site.banner.defaultLanguage,
        layout: bannerLayout(site.banner),
        primaryColor: isHex(site.banner.primaryColor) ? site.banner.primaryColor : "",
        backgroundColor: isHex(site.banner.backgroundColor) ? site.banner.backgroundColor : "",
        textColor: isHex(site.banner.textColor) ? site.banner.textColor : "",
        fontFamily: safeFontFamily(site.banner.fontFamily),
      },
      // Consent signals for Google tags and the Meta Pixel; the widget caches this to set defaults before they load.
      consentMode: {
        google: Boolean(site.banner.googleConsentMode),
        meta: Boolean(site.banner.metaPixelConsent),
        adsDataRedaction: site.banner.adsDataRedaction !== false,
        urlPassthrough: Boolean(site.banner.urlPassthrough),
        types: resolveConsentTypes(site.purposes, site.banner.consentTypes),
      },
      languages: languages.map((code) => ({ code, name: nativeName(code) })),
      strings,
      purposes: site.purposes.map((p) => ({
        key: p.key,
        essential: p.essential,
        tracking: isTracking(p),
        text: Object.fromEntries(languages.map((lang) => [lang, purposeText(p, lang)])),
      })),
      children: Boolean(site.children?.enabled),
      // Consent checkboxes on the website's own forms (widget/src/forms.js).
      forms: formsConfig(site.purposes, site.forms),
      noticeUrl: `${base}/p/${siteKey}/notice`,
      rightsUrl: `${base}/p/${siteKey}/rights`,
      parentalUrl: `${base}/p/${siteKey}/parental`,
      statusUrl: `${base}/api/public/parental/status`,
    },
    { cors: true, headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
