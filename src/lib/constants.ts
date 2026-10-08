/**
 * Product-wide constants. Legal dates and obligations live here so they can be
 * updated in one place when MeitY or the Data Protection Board issues changes.
 */

/** Date from which the substantive DPDP obligations apply (Rules notified 13 Nov 2025 + 18 months). */
export const DPDP_DEADLINE = new Date("2027-05-13T00:00:00+05:30");

/** Hours within which a detailed breach report is due to the Board (DPDP Rules, Rule 7). */
export const BREACH_REPORT_HOURS = 72;

export const DEFAULT_RESPONSE_DAYS = 30;

export const DATA_CATEGORIES = [
  { value: "name", label: "Name" },
  { value: "email", label: "Email address" },
  { value: "phone", label: "Phone number" },
  { value: "address", label: "Postal address" },
  { value: "dob", label: "Date of birth / age" },
  { value: "government_id", label: "Government ID (PAN, Aadhaar…)" },
  { value: "financial", label: "Payment or financial details" },
  { value: "health", label: "Health information" },
  { value: "location", label: "Location" },
  { value: "device", label: "Device and browsing data" },
  { value: "photo", label: "Photos or video" },
  { value: "other", label: "Other" },
] as const;

export type DataCategory = (typeof DATA_CATEGORIES)[number]["value"];
export const DATA_CATEGORY_VALUES = DATA_CATEGORIES.map((c) => c.value) as [DataCategory, ...DataCategory[]];

export const dataCategoryLabel = (value: string) =>
  DATA_CATEGORIES.find((c) => c.value === value)?.label ?? value;

/**
 * Purpose keys double as the `data-hp-purpose` attribute used for script blocking.
 * Translations of the names and descriptions live in lib/i18n/locales.
 * `tracking` marks tracking, profiling or targeted advertising, which DPDP
 * section 9(3) forbids for children even with parental consent.
 */
export const PURPOSE_PRESETS = [
  {
    key: "essential",
    name: "Essential site operation",
    description: "Keeping the website secure, remembering your privacy choices and making core features work.",
    dataCategories: ["device"],
    essential: true,
    tracking: false,
    retentionDays: 365,
  },
  {
    key: "enquiries",
    name: "Responding to your enquiries",
    description: "Using the details you share in our forms to call, email or message you back about your request.",
    dataCategories: ["name", "email", "phone"],
    essential: false,
    tracking: false,
    retentionDays: 180,
  },
  {
    key: "analytics",
    name: "Understanding how the site is used",
    description: "Measuring visits and page performance so we can improve the website.",
    dataCategories: ["device"],
    essential: false,
    tracking: true,
    retentionDays: 395,
  },
  {
    key: "marketing",
    name: "Marketing and advertising",
    description: "Showing you relevant offers and measuring our advertising on platforms such as Google and Meta.",
    dataCategories: ["device", "email", "phone"],
    essential: false,
    tracking: true,
    retentionDays: 365,
  },
] as const;

export type PresetKey = (typeof PURPOSE_PRESETS)[number]["key"];

/**
 * Whether a purpose involves tracking, profiling or targeted ads. Purposes
 * saved before the flag existed fall back to the preset's value by key.
 */
export function isTracking(p: { key: string; tracking?: boolean | null }): boolean {
  if (typeof p.tracking === "boolean") return p.tracking;
  return PURPOSE_PRESETS.find((preset) => preset.key === p.key)?.tracking ?? false;
}

export const REQUEST_TYPES = [
  { value: "access", label: "Access my data" },
  { value: "correction", label: "Correct or update my data" },
  { value: "erasure", label: "Delete my data" },
  { value: "withdraw", label: "Withdraw my consent" },
  { value: "grievance", label: "Raise a grievance" },
  { value: "nominate", label: "Nominate someone" },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number]["value"];
export const REQUEST_TYPE_VALUES = REQUEST_TYPES.map((t) => t.value) as [RequestType, ...RequestType[]];
export const requestTypeLabel = (v: string) => REQUEST_TYPES.find((t) => t.value === v)?.label ?? v;

export const REQUEST_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Declined" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["value"];
export const REQUEST_STATUS_VALUES = REQUEST_STATUSES.map((s) => s.value) as [RequestStatus, ...RequestStatus[]];
export const requestStatusLabel = (v: string) => REQUEST_STATUSES.find((s) => s.value === v)?.label ?? v;

export const BREACH_SEVERITIES = ["low", "medium", "high"] as const;
export type BreachSeverity = (typeof BREACH_SEVERITIES)[number];

/** Steps of the guided breach workflow, in order. */
export const BREACH_CHECKLIST = [
  { key: "contain", label: "Contain the breach", hint: "Revoke leaked passwords and keys, close the gap, preserve logs." },
  { key: "assess", label: "Assess what was affected", hint: "Which data categories, how many people, and the likely impact." },
  { key: "notify_board", label: "Inform the Data Protection Board", hint: "Send an initial intimation without delay." },
  { key: "notify_principals", label: "Inform affected people", hint: "Plain-language notice: what happened, likely impact, what you're doing, what they can do." },
  { key: "detailed_report", label: "Send the detailed report", hint: "Facts, causes, mitigation and findings to the Board within 72 hours." },
  { key: "review", label: "Review and prevent", hint: "Record what changed so it doesn't happen again." },
] as const;
export type BreachStepKey = (typeof BREACH_CHECKLIST)[number]["key"];
