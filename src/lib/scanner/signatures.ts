/**
 * Known third-party trackers and consent tools, matched against script URLs
 * and inline script content. Extend these lists as you meet new vendors.
 */

export type TrackerCategory = "analytics" | "marketing" | "support" | "session_recording";

export type TrackerSignature = {
  id: string;
  name: string;
  category: TrackerCategory;
  patterns: RegExp[];
};

export const TRACKERS: TrackerSignature[] = [
  { id: "ga4", name: "Google Analytics", category: "analytics", patterns: [/googletagmanager\.com\/gtag\/js/, /google-analytics\.com/, /gtag\(\s*['"]config['"]\s*,\s*['"]G-/] },
  { id: "gtm", name: "Google Tag Manager", category: "marketing", patterns: [/googletagmanager\.com\/gtm\.js/, /GTM-[A-Z0-9]{4,}/] },
  { id: "google_ads", name: "Google Ads", category: "marketing", patterns: [/googleadservices\.com/, /gtag\(\s*['"]config['"]\s*,\s*['"]AW-/, /doubleclick\.net/] },
  { id: "meta_pixel", name: "Meta Pixel", category: "marketing", patterns: [/connect\.facebook\.net\/[^"']*fbevents/, /fbq\(\s*['"]init['"]/] },
  { id: "linkedin", name: "LinkedIn Insight Tag", category: "marketing", patterns: [/snap\.licdn\.com/, /_linkedin_partner_id/] },
  { id: "tiktok", name: "TikTok Pixel", category: "marketing", patterns: [/analytics\.tiktok\.com/, /ttq\.load\(/] },
  { id: "x_pixel", name: "X (Twitter) Pixel", category: "marketing", patterns: [/static\.ads-twitter\.com/, /twq\(\s*['"]config/] },
  { id: "hotjar", name: "Hotjar", category: "session_recording", patterns: [/static\.hotjar\.com/, /hjid\s*:/] },
  { id: "clarity", name: "Microsoft Clarity", category: "session_recording", patterns: [/clarity\.ms\/tag/] },
  { id: "mixpanel", name: "Mixpanel", category: "analytics", patterns: [/cdn\.mxpnl\.com/, /mixpanel\.init\(/] },
  { id: "segment", name: "Segment", category: "analytics", patterns: [/cdn\.segment\.com/] },
  { id: "matomo", name: "Matomo", category: "analytics", patterns: [/matomo\.js/, /piwik\.js/] },
  { id: "intercom", name: "Intercom", category: "support", patterns: [/widget\.intercom\.io/, /intercomSettings/] },
  { id: "tawk", name: "Tawk.to", category: "support", patterns: [/embed\.tawk\.to/] },
  { id: "zoho_salesiq", name: "Zoho SalesIQ", category: "support", patterns: [/salesiq\.zoho/] },
  { id: "crisp", name: "Crisp", category: "support", patterns: [/client\.crisp\.chat/] },
  { id: "freshchat", name: "Freshchat", category: "support", patterns: [/wchat\.freshchat\.com/] },
];

export const CONSENT_TOOLS: { name: string; pattern: RegExp }[] = [
  { name: "HighPre", pattern: /highpre\.com\/widget\.js|data-hp-site/ },
  { name: "CookieYes", pattern: /cookieyes\.com/ },
  { name: "OneTrust", pattern: /onetrust\.com|cookielaw\.org/ },
  { name: "Cookiebot", pattern: /cookiebot\.com/ },
  { name: "Termly", pattern: /termly\.io/ },
  { name: "Osano", pattern: /osano\.com/ },
  { name: "Complianz", pattern: /complianz/ },
  { name: "Consently", pattern: /consently/i },
];

/** Form fields that collect personal data, matched on name/id/type/placeholder/autocomplete. */
export const PERSONAL_FIELDS: { label: string; pattern: RegExp }[] = [
  { label: "Email", pattern: /e-?mail/ },
  { label: "Phone", pattern: /phone|mobile|tel|whatsapp|contact.?no/ },
  { label: "Name", pattern: /(^|[^a-z])(full.?|first.?|last.?|your.?)?name($|[^a-z])/ },
  { label: "Address", pattern: /address|street|city|pin.?code|zip|postal/ },
  { label: "Date of birth", pattern: /dob|birth|(^|[^a-z])age($|[^a-z])/ },
  { label: "Government ID", pattern: /aadha?ar|(^|[^a-z])pan($|[^a-z])|passport|voter/ },
  { label: "Payment details", pattern: /card.?number|cvv|upi|account.?number|ifsc/ },
  { label: "Message", pattern: /message|comment|enquiry|inquiry/ },
];
