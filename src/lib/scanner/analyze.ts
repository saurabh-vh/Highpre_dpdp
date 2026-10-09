// The slim build skips cheerio's network helpers (and their undici dependency),
// which we don't need: pages are fetched by our own SSRF-safe client.
import * as cheerio from "cheerio/slim";
import { findMixedContent, formTarget } from "./security";
import { CONSENT_TOOLS, PERSONAL_FIELDS, TRACKERS, type TrackerSignature } from "./signatures";

export type PageAnalysis = {
  forms: { fields: string[] }[];
  trackers: TrackerSignature[];
  consentTool?: string;
  privacyLink?: string;
  mentionsGrievance: boolean;
  candidateLinks: string[];
  /** The site's declared icon (favicon), if any. */
  iconUrl?: string;
  /** http:// resources on an https page. */
  mixedContent: string[];
  /** Where forms collecting personal data submit to, when that's plain http. */
  insecureForms: string[];
};

const INTERESTING_PATH = /contact|enquir|inquir|sign.?up|register|book|appointment|get.?started|quote|demo/i;

/** Extracts compliance-relevant signals from one HTML page. */
export function analyzePage(html: string, pageUrl: string): PageAnalysis {
  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;

  // Scripts: external URLs plus inline code.
  const scriptText = $("script")
    .map((_, el) => `${$(el).attr("src") ?? ""}\n${$(el).html() ?? ""}`)
    .get()
    .join("\n");
  const iframeSrcs = $("iframe[src]").map((_, el) => $(el).attr("src")).get().join("\n");
  const haystack = `${scriptText}\n${iframeSrcs}`;

  const trackers = TRACKERS.filter((t) => t.patterns.some((p) => p.test(haystack)));
  // HighPre is recognised by its attribute, so self-hosted or local installs count too.
  const consentTool = $("script[data-hp-site]").length > 0 ? "HighPre" : CONSENT_TOOLS.find((c) => c.pattern.test(haystack))?.name;

  // Forms: group fields per <form>; stray inputs outside forms count as one group.
  const describeField = (el: Parameters<typeof $>[0]): string | null => {
    const $el = $(el);
    const type = ($el.attr("type") ?? "").toLowerCase();
    if (["hidden", "submit", "button", "checkbox", "radio", "search", "password"].includes(type)) return null;
    const signature = [type, $el.attr("name"), $el.attr("id"), $el.attr("placeholder"), $el.attr("autocomplete"), $el.attr("aria-label")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (type === "email") return "Email";
    if (type === "tel") return "Phone";
    return PERSONAL_FIELDS.find((f) => f.pattern.test(signature))?.label ?? null;
  };

  const forms: { fields: string[] }[] = [];
  const insecureForms = new Set<string>();
  $("form").each((_, form) => {
    const fields = new Set<string>();
    $(form).find("input, textarea, select").each((__, el) => {
      const label = describeField(el);
      if (label) fields.add(label);
    });
    if (fields.size > 0) forms.push({ fields: [...fields] });
    const target = formTarget($(form).attr("action"), pageUrl);
    if ([...fields].some((f) => f !== "Message") && target?.startsWith("http:")) insecureForms.add(target);
  });
  const stray = new Set<string>();
  $("input, textarea").not("form input, form textarea").each((_, el) => {
    const label = describeField(el);
    if (label) stray.add(label);
  });
  if (stray.size > 0) forms.push({ fields: [...stray] });

  // Links: privacy notice and pages likely to hold forms.
  let privacyLink: string | undefined;
  const candidateLinks = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const text = $(a).text().trim().toLowerCase();
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (!/^https?:$/.test(abs.protocol)) return;
    if (!privacyLink && (/privacy/i.test(href) || /privacy|गोपनीयता/.test(text))) privacyLink = abs.toString();
    if (abs.origin === origin && INTERESTING_PATH.test(`${abs.pathname} ${text}`)) {
      abs.hash = "";
      candidateLinks.add(abs.toString());
    }
  });

  // Prefer a PNG icon of a reasonable size; SVG icons are skipped (not served by HighPre).
  const icons = $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')
    .map((_, el) => ({ href: $(el).attr("href") ?? "", type: $(el).attr("type") ?? "", rel: $(el).attr("rel") ?? "" }))
    .get()
    .filter((i) => i.href && !/\.svg(\?|$)/i.test(i.href) && !i.type.includes("svg"));
  const icon = icons.find((i) => /png/i.test(i.type) || /\.png(\?|$)/i.test(i.href)) ?? icons.find((i) => !/apple/.test(i.rel)) ?? icons[0];
  let iconUrl: string | undefined;
  try {
    if (icon) iconUrl = new URL(icon.href, pageUrl).toString();
  } catch {
    /* ignore malformed icon links */
  }

  const bodyText = $("body").text().toLowerCase();
  const mentionsGrievance = /grievance|data protection officer|शिकायत अधिकारी/.test(bodyText);

  return {
    forms,
    trackers,
    consentTool,
    privacyLink,
    mentionsGrievance,
    candidateLinks: [...candidateLinks],
    iconUrl,
    mixedContent: findMixedContent($, pageUrl),
    insecureForms: [...insecureForms],
  };
}
