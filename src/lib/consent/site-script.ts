import { resolveConsentTypes } from "@/lib/consent-mode";
import { BADGE_LABEL, badgeDimensions, type BadgeSize, type BadgeTheme } from "@/lib/privacy-centre/badge";
import { isPrivacyCentreAvailable } from "@/lib/privacy-centre/shape";

/**
 * Settings shared by the per-site script (/s/<siteKey>.js) and the config API,
 * so one pasted line can switch the banner, badge and consent signals on or off
 * from the dashboard.
 */

type SiteLike = {
  siteKey: string;
  publishedNoticeVersion?: number | null;
  purposes: { key: string; name?: string; essential?: boolean | null }[];
  banner: {
    googleConsentMode?: boolean | null;
    metaPixelConsent?: boolean | null;
    adsDataRedaction?: boolean | null;
    urlPassthrough?: boolean | null;
    consentTypes?: { purpose: string; types?: string[] | null }[] | null;
  };
  privacyCentre?: {
    enabled?: boolean | null;
    badge?: { enabled?: boolean | null; placement?: string | null; theme?: string | null; size?: string | null } | null;
  } | null;
};

/** The snippet customers paste: one line, no attributes. */
export const siteScriptTag = (appUrl: string, siteKey: string) => `<script src="${appUrl}/s/${siteKey}.js"></script>`;

/**
 * Consent Mode settings in the shape widget.js caches, or null when neither
 * Google nor Meta signals are on. Embedded in the per-site script so the
 * "denied" defaults are set synchronously, even on a visitor's first page.
 */
export function bootConsentMode(site: SiteLike) {
  const b = site.banner;
  if (!b.googleConsentMode && !b.metaPixelConsent) return null;
  return {
    google: Boolean(b.googleConsentMode),
    meta: Boolean(b.metaPixelConsent),
    adsDataRedaction: b.adsDataRedaction !== false,
    urlPassthrough: Boolean(b.urlPassthrough),
    types: resolveConsentTypes(site.purposes, b.consentTypes),
    essential: site.purposes.filter((p) => p.essential).map((p) => p.key),
  };
}

/** The badge the widget draws, or null when it's off or the privacy centre isn't live. */
export function badgeConfig(site: SiteLike, appUrl: string) {
  const badge = site.privacyCentre?.badge;
  if (!badge?.enabled || !isPrivacyCentreAvailable(site)) return null;
  const theme: BadgeTheme = badge.theme === "dark" ? "dark" : "light";
  const size: BadgeSize = badge.size === "small" ? "small" : "regular";
  const params = [theme === "dark" ? "theme=dark" : "", size === "small" ? "size=small" : ""].filter(Boolean).join("&");
  return {
    url: `${appUrl}/p/${site.siteKey}`,
    image: `${appUrl}/p/${site.siteKey}/badge.svg${params ? `?${params}` : ""}`,
    label: BADGE_LABEL,
    placement: badge.placement === "corner" ? "corner" : "footer",
    ...badgeDimensions(size),
  };
}
