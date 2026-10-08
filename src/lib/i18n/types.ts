import type { DataCategory, PresetKey, RequestType } from "@/lib/constants";

/**
 * Everything a visitor or data principal reads, for one language. Each locale
 * file must satisfy this type, so a missing string is a compile error.
 * Strings are plain language for the public, not legal drafting.
 */
export type Locale = {
  notice: NoticeStrings;
  /** Labels for the data categories in DATA_CATEGORIES. */
  categories: Record<DataCategory, string>;
  /** Default wording for the purpose presets in PURPOSE_PRESETS. */
  purposes: Record<PresetKey, { name: string; description: string }>;
  requestTypes: Record<RequestType, string>;
  widget: WidgetStrings;
  portal: PortalStrings;
  parental: ParentalStrings;
};

export type NoticeStrings = {
  title: (siteName: string) => string;
  intro: (businessName: string) => string;
  collectHeading: string;
  collectNone: string;
  /** One bullet in "What we collect and why". */
  purposeLine: (p: { name: string; description: string; categories: string; retention: string; essential: boolean; sharedWith?: string }) => string;
  notSpecified: string;
  choicesHeading: string;
  choicesBody: string;
  rightsHeading: string;
  rightsBody: (rightsUrl: string) => string;
  contactHeading: string;
  contactNone: string;
  contactLabels: { officer: string; email: string; phone: string; address: string };
  respondWithin: (days: number) => string;
  childrenHeading: string;
  childrenBody: string;
  complaintsHeading: string;
  complaintsBody: string;
  changesHeading: string;
  changesBody: (version: number, date: string) => string;
  retention: { years: (n: number) => string; months: (n: number) => string; days: (n: number) => string };
};

/** Plain strings only: these are sent as JSON to widget.js on customer websites. */
export type WidgetStrings = {
  /** Used when the business hasn't customised the banner heading. */
  defaultTitle: string;
  /** Used when the business hasn't customised the banner message. */
  defaultMessage: string;
  acceptAll: string;
  rejectAll: string;
  choose: string;
  save: string;
  back: string;
  notice: string;
  rights: string;
  essential: string;
  settings: string;
  language: string;
  ageTitle: string;
  ageBody: string;
  ageAdult: string;
  ageChild: string;
  childTitle: string;
  childBody: string;
  askParent: string;
  essentialOnly: string;
  waitingParent: string;
  notForChildren: string;
};

export type PortalStrings = {
  title: (business: string) => string;
  intro: string;
  email: string;
  sendCode: string;
  sending: string;
  codeSent: (email: string) => string;
  changeEmail: string;
  code: string;
  type: string;
  name: string;
  phone: string;
  details: string;
  detailsHint: string;
  submit: string;
  submitting: string;
  doneTitle: string;
  done: (ref: string, due: string) => string;
  genericError: string;
};

export type ParentalStrings = {
  title: (business: string) => string;
  intro: string;
  /** Shown when the page is opened without the child's banner link. */
  missingLink: string;
  parentEmail: string;
  sendCode: string;
  sending: string;
  codeSent: (email: string) => string;
  changeEmail: string;
  code: string;
  parentName: string;
  childName: string;
  childNameHint: string;
  relationship: string;
  relParent: string;
  relGuardian: string;
  purposesLegend: string;
  purposesHint: string;
  trackingBlocked: string;
  declaration: string;
  submit: string;
  submitting: string;
  doneTitle: string;
  done: string;
  genericError: string;
};
