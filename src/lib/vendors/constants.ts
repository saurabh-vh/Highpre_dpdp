// Client-safe labels for the vendor register. The first four categories match
// the scanner's tracker categories so detected vendors map across directly.

export const VENDOR_CATEGORIES = [
  { value: "analytics", label: "Analytics" },
  { value: "marketing", label: "Advertising and marketing" },
  { value: "session_recording", label: "Session recording" },
  { value: "support", label: "Support and chat" },
  { value: "consent", label: "Consent management" },
  { value: "payments", label: "Payments" },
  { value: "hosting", label: "Hosting and CDN" },
  { value: "email", label: "Email and messaging" },
  { value: "crm", label: "CRM and sales" },
  { value: "other", label: "Other" },
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number]["value"];
export const VENDOR_CATEGORY_VALUES = VENDOR_CATEGORIES.map((c) => c.value) as [VendorCategory, ...VendorCategory[]];
export const vendorCategoryLabel = (v: string) => VENDOR_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export const DPA_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "requested", label: "Requested" },
  { value: "signed", label: "Signed" },
  { value: "not_needed", label: "Not needed" },
] as const;
export type DpaStatus = (typeof DPA_STATUSES)[number]["value"];
export const DPA_STATUS_VALUES = DPA_STATUSES.map((s) => s.value) as [DpaStatus, ...DpaStatus[]];
export const dpaStatusLabel = (v: string) => DPA_STATUSES.find((s) => s.value === v)?.label ?? v;

/** A vendor needs no further action once its DPA is signed or ruled out. */
export const dpaCovered = (status: string | null | undefined) => status === "signed" || status === "not_needed";

/** Suggested "data shared" wording for vendors added by a scan; editable afterwards. */
export const DEFAULT_DATA_SHARED: Partial<Record<VendorCategory, string>> = {
  analytics: "Pages visited, device and browser details, IP address",
  marketing: "Pages visited, ad and device identifiers, IP address",
  session_recording: "Clicks, scrolls and page interactions, device details, IP address",
  support: "Chat messages, and any name, email or phone visitors share",
  consent: "Consent choices, device details, IP address",
};
