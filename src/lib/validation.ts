import { z } from "zod";
import { BREACH_SEVERITIES, DATA_CATEGORY_VALUES, REQUEST_STATUS_VALUES, REQUEST_TYPE_VALUES } from "./constants";
import { LANG_CODES } from "./i18n/languages";
import { DPA_STATUS_VALUES, VENDOR_CATEGORY_VALUES } from "./vendors/constants";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use 128 characters or fewer.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  company: z.string().trim().min(2, "Enter your business name.").max(120),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password });

export const siteSchema = z.object({
  name: z.string().trim().min(2, "Give the site a name.").max(80),
  url: z
    .string()
    .trim()
    .min(4, "Enter the website address.")
    .transform((v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`))
    .refine((v) => {
      try {
        return new URL(v).hostname.includes(".");
      } catch {
        return false;
      }
    }, "Enter a valid address, like example.com."),
});

export const purposeSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{2,40}$/, "Use 2–40 lowercase letters, numbers, - or _."),
  name: z.string().trim().min(3, "Name the purpose.").max(120),
  description: z.string().trim().min(10, "Describe the purpose in a sentence.").max(600),
  translations: z
    .array(z.object({ lang: z.enum(LANG_CODES), name: z.string().trim().max(120), description: z.string().trim().max(600) }))
    .default([]),
  dataCategories: z.array(z.enum(DATA_CATEGORY_VALUES)).min(1, "Pick at least one type of data."),
  essential: z.boolean(),
  tracking: z.boolean(),
  retentionDays: z.coerce.number().int().min(1, "At least 1 day.").max(3650, "At most 10 years."),
  storedIn: z.string().trim().max(200).optional().default(""),
  sharedWith: z.string().trim().max(200).optional().default(""),
});

export const bannerSchema = z.object({
  position: z.enum(["bottom", "bottom-left", "bottom-right"]),
  theme: z.enum(["dark", "light"]),
  title: z.string().trim().min(3).max(80),
  message: z.string().trim().min(10).max(300),
  defaultLanguage: z.enum(LANG_CODES),
  showReopenButton: z.boolean(),
});

export const siteLanguagesSchema = z.object({
  languages: z.array(z.enum(LANG_CODES)).min(1),
});

export const childrenSettingsSchema = z.object({ enabled: z.boolean() });

export const inviteSchema = z.object({
  email,
  role: z.enum(["admin", "member"]),
});

export const memberRoleSchema = z.object({
  userId: z.string().regex(/^[a-f0-9]{24}$/),
  role: z.enum(["owner", "admin", "member"]),
});

export const profileSchema = z.object({ name: z.string().trim().min(2, "Enter your name.").max(80) });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  password,
});

/** Authenticator code (6 digits) or, where accepted, a recovery code ("xxxxx-xxxxx"). */
const twoFactorCode = z.string().trim().min(6, "Enter the 6-digit code from your app.").max(24, "That code is too long.");

export const twoFactorCodeSchema = z.object({ code: twoFactorCode });

export const disableTwoFactorSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  code: twoFactorCode,
});

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2, "Enter your name.").max(80),
  password,
});

export const orgSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).optional().default(""),
  address: z.string().trim().max(300).optional().default(""),
  grievanceOfficerName: z.string().trim().max(120).optional().default(""),
  grievanceEmail: z.union([email, z.literal("")]).optional().default(""),
  grievancePhone: z.string().trim().max(30).optional().default(""),
  responseDays: z.coerce.number().int().min(1).max(90),
});

export const requestUpdateSchema = z.object({
  status: z.enum(REQUEST_STATUS_VALUES),
  note: z.string().trim().max(2000).optional().default(""),
});

export const breachSchema = z.object({
  title: z.string().trim().min(5, "Describe the incident in a few words.").max(160),
  description: z.string().trim().max(5000).optional().default(""),
  severity: z.enum(BREACH_SEVERITIES),
  discoveredAt: z.date({ required_error: "Enter when you found out.", invalid_type_error: "Enter when you found out." }),
  dataCategories: z.array(z.enum(DATA_CATEGORY_VALUES)).default([]),
  affectedCount: z.coerce.number().int().min(0).optional(),
});

// Date inputs ("YYYY-MM-DD") are stored at noon UTC so the calendar day reads the same in any timezone.
const dateInput = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")])
  .optional()
  .transform((v) => (v ? new Date(`${v}T12:00:00Z`) : undefined));

export const vendorSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the vendor's name.").max(120),
    category: z.enum(VENDOR_CATEGORY_VALUES),
    website: z
      .string()
      .trim()
      .max(300)
      .optional()
      .default("")
      .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
      .refine((v) => {
        try {
          return !v || new URL(v).hostname.includes(".");
        } catch {
          return false;
        }
      }, "Enter a valid address, like example.com."),
    processingCountry: z.string().trim().max(80).optional().default(""),
    dataShared: z.string().trim().max(500).optional().default(""),
    dpaStatus: z.enum(DPA_STATUS_VALUES),
    dpaSignedAt: dateInput,
    dpaRenewalAt: dateInput,
    contactEmail: z.union([email, z.literal("")]).optional().default(""),
    notes: z.string().trim().max(2000).optional().default(""),
  })
  .superRefine((v, ctx) => {
    if (v.dpaStatus === "signed" && !v.dpaSignedAt) ctx.addIssue({ code: "custom", path: ["dpaSignedAt"], message: "Enter when the agreement was signed." });
    if (v.dpaSignedAt && v.dpaRenewalAt && v.dpaRenewalAt <= v.dpaSignedAt) ctx.addIssue({ code: "custom", path: ["dpaRenewalAt"], message: "Renewal must be after signing." });
  });

// ── Public (widget and rights portal) ───────────────────────────────

export const consentEventSchema = z.object({
  siteKey: z.string().min(8).max(40),
  principalId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  action: z.enum(["grant", "update", "withdraw"]),
  noticeVersion: z.number().int().min(0),
  decisions: z.array(z.object({ purpose: z.string().max(40), granted: z.boolean() })).max(30),
  language: z.enum(LANG_CODES).default("en"),
  ageGroup: z.enum(["adult", "child"]).optional(),
  pageUrl: z.string().max(500).optional(),
});

export const otpRequestSchema = z.object({
  siteKey: z.string().min(8).max(40),
  email,
  purpose: z.enum(["rights", "parental"]).default("rights"),
});

export const rightsSubmitSchema = z.object({
  siteKey: z.string().min(8).max(40),
  email,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  type: z.enum(REQUEST_TYPE_VALUES),
  name: z.string().trim().min(2, "Enter your name.").max(120),
  phone: z.string().trim().max(30).optional().default(""),
  details: z.string().trim().max(3000).optional().default(""),
  language: z.enum(LANG_CODES).default("en"),
});

export const parentalSubmitSchema = z.object({
  siteKey: z.string().min(8).max(40),
  principalId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Open this page from the website's privacy banner."),
  email,
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  parentName: z.string().trim().min(2, "Enter your name.").max(120),
  childName: z.string().trim().max(80).optional().default(""),
  relationship: z.enum(["parent", "guardian"]),
  purposes: z.array(z.string().max(40)).max(30).default([]),
  declaration: z.literal(true, { errorMap: () => ({ message: "Confirm the declaration to continue." }) }),
  language: z.enum(LANG_CODES).default("en"),
});

export const publicScanSchema = z.object({ url: z.string().trim().min(4).max(300) });
