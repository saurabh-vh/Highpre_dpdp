/**
 * Landing page copy, kept apart from layout so it can be edited without
 * touching components. Every claim here should stay factual and checkable.
 */

export const hero = {
  title: "India's privacy law is here. Get ready in an afternoon.",
  subtitle:
    "HighPre makes your website and your team DPDP-ready: a cookie banner, a privacy notice in 8 Indian languages, data requests, breach reporting and proof of every consent, in one simple tool.",
};

/** Why it matters. Figures are from the DPDP Act 2023 and the DPDP Rules 2025 (notified 13 November 2025). */
export const stakes = [
  { figure: "₹250 crore", label: "Maximum penalty for failing to protect personal data." },
  { figure: "₹200 crore", label: "Maximum penalty for not reporting a data breach." },
  { figure: "72 hours", label: "To send the Data Protection Board a full report after a breach." },
  { figure: "13 May 2027", label: "When every core duty applies. The Board is already set up." },
] as const;

/** Where most websites stand today, and what HighPre changes. */
export const beforeAfter = [
  { before: "Google Analytics and ad pixels load before anyone agrees.", after: "Nothing tracks a visitor until they say yes." },
  { before: "No privacy notice, or one copied from another site.", after: "A clear notice written for you, in your visitor's language." },
  { before: "No proof of who agreed to what.", after: "Every choice saved with the exact notice they saw." },
  { before: "Data requests get lost in someone's inbox.", after: "One inbox, every deadline tracked, reminders before it's late." },
  { before: "Staff paste customer data into ChatGPT.", after: "A warning before it happens, and an alert for you." },
] as const;

/** The three things HighPre covers. */
export const pillars = [
  {
    id: "website",
    title: "Your website",
    pitch: "Compliant from the first visit.",
    points: [
      "Scan finds trackers, forms and gaps",
      "Cookie banner in your brand colours",
      "Privacy notice in 8 Indian languages",
      "Consent tick boxes on your forms",
      "Public privacy page and badge",
      "Checked again every week",
    ],
  },
  {
    id: "team",
    title: "Your team",
    pitch: "Stops leaks before they happen.",
    points: [
      "Desktop app and browser extension",
      "Warns before private data goes into AI or chat apps",
      "You get an alert; the data never leaves the computer",
      "One installer for every company computer",
    ],
  },
  {
    id: "proof",
    title: "Your proof",
    pitch: "Ready when someone asks.",
    points: [
      "Consent records you can export",
      "Data request inbox with deadlines",
      "72-hour breach checklist",
      "Vendor list with contract dates",
      "One-click PDF evidence pack",
    ],
  },
] as const;

export const obligations = [
  {
    law: "Tell people what you collect and why.",
    fix: "We draft a clear notice for each purpose, in up to eight Indian languages, and keep every version.",
  },
  {
    law: "Ask before you collect.",
    fix: "A consent banner that holds back trackers until people agree, with an equally easy way to say no.",
  },
  {
    law: "Prove it later.",
    fix: "Every decision is logged with the exact notice version shown. Export the ledger anytime.",
  },
  {
    law: "Answer requests to access, correct or erase data.",
    fix: "An email-verified request page for your visitors and an inbox that tracks every due date.",
  },
  {
    law: "Report breaches quickly.",
    fix: "A guided checklist with the 72-hour reporting clock built in, and email reminders before it runs out.",
  },
  {
    law: "Protect children's data.",
    fix: "An optional age check, verified parental consent, and tracking switched off for under-18s.",
  },
] as const;

export const steps = [
  { title: "Scan your website", body: "Type your address. We show what it collects and what's missing." },
  { title: "Answer a few questions", body: "Why you collect each kind of data. We write your privacy notice from that." },
  { title: "Paste one line", body: "Add it to your website once. Switch everything else on from your dashboard." },
] as const;

export const faqs = [
  {
    q: "Does the DPDP Act apply to my business?",
    a: "Very likely. It covers organisations that process digital personal data of people in India — a phone number from an enquiry form counts. There is no general exemption for small businesses.",
  },
  {
    q: "When do I need to be compliant?",
    a: "The core obligations — notice, consent, rights and breach reporting — apply from 13 May 2027. The Data Protection Board is already set up and accepting complaints.",
  },
  {
    q: "What happens if I ignore it?",
    a: "Penalties go up to ₹250 crore for failing to protect personal data and up to ₹200 crore for not reporting a breach. Most businesses will feel it first as complaints from customers and questions from larger clients.",
  },
  {
    q: "Is HighPre a registered Consent Manager?",
    a: "No. Under DPDP a Consent Manager is a separately registered intermediary. HighPre is software your business uses to collect, record and honour consent itself.",
  },
  {
    q: "Do you store my visitors' IP addresses?",
    a: "No. The banner identifies a visitor with a random ID it creates, and IP addresses are stored only as salted hashes. We don't fingerprint anyone.",
  },
  {
    q: "Is this legal advice?",
    a: "No. HighPre gives you the tools and templates to meet DPDP requirements. For decisions specific to your business, speak to a lawyer.",
  },
  {
    q: "What does it cost?",
    a: "One website is free forever. Paid plans start at ₹999 a month plus GST for more websites, teammates, all eight languages and the PDF evidence pack. See pricing above.",
  },
] as const;
