import Link from "next/link";

/** Shown for unknown sites and pages a business hasn't published (or has turned off). */
export default function PublicSiteNotFound() {
  return (
    <div className="text-pretty">
      <p className="text-2xs font-medium uppercase tracking-[0.14em] text-mist">Not available</p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">This privacy page isn&apos;t available</h1>
      <p className="mt-4 text-sm leading-relaxed text-fog/90">
        The business may not have published it yet, or the link may be out of date. To ask about your personal data, contact the business through its website.
      </p>
      <Link href="/" className="mt-8 inline-block text-sm underline decoration-white/30 underline-offset-4 hover:decoration-white">
        Go to HighPre
      </Link>
    </div>
  );
}
