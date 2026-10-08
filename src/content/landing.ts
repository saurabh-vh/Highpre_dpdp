/**
 * Landing page copy, kept apart from layout so it can be edited without
 * touching components. Every claim here should stay factual and checkable.
 */

export const hero = {
  title: "Get your website ready for India's privacy law.",
  subtitle:
    "HighPre finds the personal data your site collects, writes your privacy notice in English, Hindi and six more Indian languages, records every consent and tracks data requests to their deadline.",
};

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
  { title: "Scan your website", body: "Paste your address. We find forms, trackers and missing notices across your key pages." },
  { title: "Confirm your purposes", body: "Say why you collect each kind of data and how long you keep it. We write the notice from that." },
  { title: "Add one line of code", body: "Paste the snippet before </head>. Consent starts recording on your very next visitor." },
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
    a: "The Act allows penalties of up to ₹250 crore per breach of its obligations. Most businesses will feel it first as complaints from customers and questions from larger clients.",
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
