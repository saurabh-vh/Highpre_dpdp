import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy notice" };

// HighPre's own notice. Review with a lawyer and keep it current: a privacy
// product is judged first by how it treats its own users' data.
const sections = [
  {
    heading: "What we collect and why",
    body: "Account holders: your name, email and business details, to run your account. Website scans: the address you enter and the public page content we read, to produce your report. Visitors to our customers' websites: consent choices with a random identifier, a salted hash of the IP address and the browser type, stored on behalf of that customer as proof of consent. People filing data requests: name, email and request details, passed to the business concerned.",
  },
  {
    heading: "Desktop agent",
    body: "If your organisation installs the HighPre Agent or browser extension, it checks text you copy, paste or send to AI and chat apps for things like passwords and card numbers. That text never leaves your computer. When it warns you, we receive only the kind of data, the app, the time, what you chose to do and the computer's name (and, for installs set up by your IT team, your computer sign-in name), and share them with your organisation's owners.",
  },
  {
    heading: "Payments",
    body: "Subscriptions are processed by Razorpay. We receive the payment status and invoice details, never your full card or bank details.",
  },
  {
    heading: "What we don't do",
    body: "We don't sell personal data, run advertising trackers on our product or fingerprint devices.",
  },
  {
    heading: "Where data is stored",
    body: "On servers and databases hosted in India, encrypted in transit.",
  },
  {
    heading: "Your rights",
    body: "You can ask to access, correct or delete your data, or raise a grievance, by writing to privacy@highpre.com. We respond within 30 days. If you're not satisfied, you can complain to the Data Protection Board of India.",
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 pb-16 pt-28 sm:px-6 sm:pb-24 sm:pt-36">
      <h1 className="text-2xl font-semibold">Privacy notice</h1>
      <p className="mt-3 text-sm text-mist">How HighPre handles personal data.</p>
      <div className="mt-10 space-y-8 sm:mt-12 sm:space-y-10">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-base font-medium">{s.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-fog/90">{s.body}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
