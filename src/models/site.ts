import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";
import { DATA_CATEGORY_VALUES } from "@/lib/constants";
import { DEFAULT_SITE_LANGUAGES, LANG_CODES } from "@/lib/i18n/languages";
import { BANNER_LAYOUTS } from "@/lib/banner-layout";
import { GOOGLE_CONSENT_TYPES } from "@/lib/consent-mode";

const translationSchema = new Schema(
  {
    lang: { type: String, enum: LANG_CODES, required: true },
    name: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 600, default: "" },
  },
  { _id: false },
);

/** A purpose is one reason the business processes personal data (the "data inventory"). */
const purposeSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 600 },
    /** Wording in other languages. Missing entries fall back to preset wording, then English. */
    translations: { type: [translationSchema], default: [] },
    // Legacy Hindi fields from before multi-language support; read by purposeText().
    nameHi: { type: String, trim: true, default: "" },
    descriptionHi: { type: String, trim: true, default: "" },
    dataCategories: { type: [String], enum: DATA_CATEGORY_VALUES, default: [] },
    essential: { type: Boolean, default: false },
    /** Tracking, profiling or targeted ads: never allowed for children (DPDP s.9(3)). */
    tracking: { type: Boolean, default: false },
    retentionDays: { type: Number, min: 1, max: 3650, default: 365 },
    storedIn: { type: String, trim: true, default: "" },
    sharedWith: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const bannerSchema = new Schema(
  {
    position: { type: String, enum: ["bottom", "bottom-left", "bottom-right"], default: "bottom-right" },
    theme: { type: String, enum: ["dark", "light"], default: "dark" },
    title: { type: String, trim: true, maxlength: 80, default: "Your privacy, your choice" },
    message: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "We use your data only for the purposes below. Choose what you're comfortable with — you can change this anytime.",
    },
    defaultLanguage: { type: String, enum: LANG_CODES, default: "en" },
    showReopenButton: { type: Boolean, default: true },
    /** bar | popup | box. Unset on older banners: resolved from position by bannerLayout(). */
    layout: { type: String, enum: BANNER_LAYOUTS },
    /** Custom colours (#rrggbb) and font-family list; empty means the theme's defaults and the system font. */
    primaryColor: { type: String, default: "" },
    backgroundColor: { type: String, default: "" },
    textColor: { type: String, default: "" },
    fontFamily: { type: String, trim: true, maxlength: 200, default: "" },
    /** Google Consent Mode v2 and Meta Pixel consent signals sent by the widget. */
    googleConsentMode: { type: Boolean, default: false },
    metaPixelConsent: { type: Boolean, default: false },
    adsDataRedaction: { type: Boolean, default: true },
    urlPassthrough: { type: Boolean, default: false },
    /** Purpose → Google consent types. Purposes without an entry use defaultConsentTypes(). */
    consentTypes: {
      type: [new Schema({ purpose: { type: String, required: true }, types: { type: [String], enum: GOOGLE_CONSENT_TYPES, default: [] } }, { _id: false })],
      default: undefined,
    },
  },
  { _id: false },
);

const siteSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    url: { type: String, required: true, trim: true },
    siteKey: { type: String, required: true, unique: true },
    purposes: { type: [purposeSchema], default: [] },
    banner: { type: bannerSchema, default: () => ({}) },
    /** Languages offered in the notice, banner and request pages. English is always included. */
    languages: { type: [String], enum: LANG_CODES, default: () => [...DEFAULT_SITE_LANGUAGES] },
    /** Ask visitors their age and collect parental consent for under-18s. */
    children: {
      enabled: { type: Boolean, default: false },
    },
    /** Consent checkboxes the widget adds to the website's own forms (widget/src/forms.js). */
    forms: {
      /** Add the boxes to any form asking for an email, phone or name, not just marked ones. */
      autoProtect: { type: Boolean, default: false },
      /** Purpose keys shown on auto-protected forms and on forms marked data-hp-consent="". */
      purposes: { type: [String], default: [] },
      /** Purpose keys whose box must be ticked before the form submits (unless data-hp-required says otherwise). */
      requiredPurposes: { type: [String], default: [] },
    },
    /** Weekly automatic rescans with change alerts. Sites created before this field count as on. */
    monitoring: {
      enabled: { type: Boolean, default: true },
      lastAlertAt: { type: Date },
    },
    /** Public privacy centre at /p/<siteKey>. Shown only once a notice is published. */
    privacyCentre: {
      enabled: { type: Boolean, default: true },
      /** List active vendors from the register (name, category, country). */
      showVendors: { type: Boolean, default: false },
    },
    publishedNoticeVersion: { type: Number, default: 0 },
    lastScanId: { type: Schema.Types.ObjectId, ref: "Scan" },
    /** The site's favicon, fetched during scans and served from HighPre (never hot-linked). */
    favicon: {
      data: { type: Buffer, select: false },
      contentType: { type: String },
      fetchedAt: { type: Date },
    },
    /** Colours and font found on the website during scans; offered as "Use my website's colours". */
    brand: {
      primary: { type: String },
      background: { type: String },
      text: { type: String },
      font: { type: String },
      fetchedAt: { type: Date },
    },
    widgetLastSeenAt: { type: Date },
  },
  { timestamps: true },
);

export type PurposeDoc = InferSchemaType<typeof purposeSchema>;
export type BannerDoc = InferSchemaType<typeof bannerSchema>;
export type SiteDoc = InferSchemaType<typeof siteSchema>;
export const Site: Model<SiteDoc> = models.Site ?? model("Site", siteSchema);
