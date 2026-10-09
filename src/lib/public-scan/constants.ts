// Client-safe constants for public scan reports and leads.

/** Shareable public scan reports live this long, then MongoDB's TTL index removes them. */
export const REPORT_TTL_DAYS = 30;
export const REPORT_TTL_SECONDS = REPORT_TTL_DAYS * 86_400;

export const REPORT_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Opt-in to product updates, offered next to "Email me the PDF report".
 * Separate from delivering the report itself, never pre-ticked, and stored
 * with the wording and version shown so the consent can be proven later.
 */
export const MARKETING_CONSENT = {
  purpose: "product_updates",
  version: "2026-10-scan-v1",
  text: "Send me occasional product updates from HighPre",
} as const;
