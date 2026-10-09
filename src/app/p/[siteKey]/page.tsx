import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Baby, FileText, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { connectDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { LANG_CODES, getLocale, nativeName, pickLang } from "@/lib/i18n";
import { buildPrivacyCentre, isPrivacyCentreAvailable } from "@/lib/privacy-centre/shape";
import { cn } from "@/lib/utils";
import { Notice, Organization, Scan, Site, Vendor } from "@/models";

type Props = { params: Promise<{ siteKey: string }>; searchParams: Promise<{ lang?: string }> };

async function load({ params, searchParams }: Props) {
  const [{ siteKey }, { lang }] = await Promise.all([params, searchParams]);
  await connectDb();
  const site = await Site.findOne({ siteKey }).select("orgId name url purposes children publishedNoticeVersion privacyCentre banner.showReopenButton").lean();
  if (!site || !isPrivacyCentreAvailable(site)) return null;
  const [org, notice, scan, vendors] = await Promise.all([
    Organization.findById(site.orgId).select("name legalName grievanceOfficerName grievanceEmail grievancePhone responseDays").lean(),
    Notice.findOne({ siteId: site._id, version: site.publishedNoticeVersion }).select("version content languages createdAt").lean(),
    Scan.findOne({ siteId: site._id, status: "complete" }).sort({ createdAt: -1 }).select("createdAt consentTool trackers cookies").lean(),
    site.privacyCentre?.showVendors
      ? Vendor.find({ orgId: site.orgId, archivedAt: null }).select("name category processingCountry source siteIds archivedAt").lean()
      : Promise.resolve([]),
  ]);
  if (!org || !notice) return null;
  // Languages come from the published notice, as on the notice page.
  const languages = LANG_CODES.filter((l) => notice.content?.[l]);
  const language = pickLang(lang, languages);
  const view = buildPrivacyCentre({ site, org, notice, languages, lang: language, scan, vendors });
  return { siteKey, language, view };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props);
  return {
    title: data ? `Privacy centre, ${data.view.siteName}` : "Privacy centre",
    description: data ? `How ${data.view.businessName} handles personal data on ${data.view.siteHost}, and how to make a data request.` : undefined,
  };
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t border-white/10 pt-10", className)}>
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function PrivacyCentrePage(props: Props) {
  const data = await load(props);
  if (!data) notFound();
  const { siteKey, language, view } = data;
  const q = `?lang=${language}`;
  const settingsLabel = getLocale(language).widget.settings;

  const actions = [
    { href: `/p/${siteKey}/notice${q}`, icon: FileText, title: "Read the privacy notice", body: "What is collected, why, for how long, and who it's shared with." },
    { href: `/p/${siteKey}/rights${q}`, icon: Inbox, title: "Make a data request", body: "Access, correct or erase your data, withdraw consent, or raise a grievance." },
    ...(view.parentalConsent
      ? [{ href: `/p/${siteKey}/parental${q}`, icon: Baby, title: "Parental consent", body: "For parents and guardians of visitors under 18." }]
      : []),
  ];

  return (
    <div className="text-pretty">
      {view.notice.languages.length > 1 && (
        <nav aria-label="Language" className="mb-12 inline-flex max-w-full flex-wrap gap-1 rounded-[20px] border border-white/10 bg-white/[0.04] p-1">
          {view.notice.languages.map((l) => (
            <Link
              key={l}
              href={`/p/${siteKey}?lang=${l}`}
              aria-current={language === l ? "page" : undefined}
              lang={l}
              className={cn("rounded-full px-4 py-1.5 text-xs font-medium transition-colors", language === l ? "bg-paper text-ink" : "text-fog hover:text-paper")}
            >
              {nativeName(l)}
            </Link>
          ))}
        </nav>
      )}

      <header>
        <p className="text-2xs font-medium uppercase tracking-[0.14em] text-mist">Privacy centre</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight text-balance sm:text-2xl">{view.businessName}</h1>
        <a
          href={view.siteUrl}
          rel="noopener"
          className="mt-2 inline-flex items-center gap-1 text-sm text-fog underline decoration-white/30 underline-offset-4 hover:decoration-white"
        >
          {view.siteHost}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </a>
        <p className="mt-5 text-sm leading-relaxed text-fog/90">
          How {view.businessName} handles your personal data on {view.siteHost}, and how to use your rights under India&apos;s Digital Personal Data Protection Act, 2023.
        </p>
      </header>

      <ul className={cn("mt-10 grid gap-3", actions.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {actions.map((a) => (
          <li key={a.href}>
            <Link
              href={a.href}
              className="group flex h-full flex-col rounded-panel border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/25 hover:bg-white/[0.06]"
            >
              <a.icon className="size-5 text-fog" strokeWidth={1.6} aria-hidden />
              <span className="mt-4 text-sm font-medium">{a.title}</span>
              <span className="mt-1 text-xs leading-relaxed text-mist">{a.body}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-14 space-y-12">
        <Section title="What your data is used for">
          <p className="text-xs text-mist">
            From the privacy notice
            {view.notice.updatedAt ? `, last updated ${formatDate(view.notice.updatedAt)}` : ""} · version {view.notice.version}
            {view.notice.languages.length > 1 ? ` · in ${view.notice.languages.map(nativeName).join(", ")}` : ""}
          </p>
          {view.purposes.length > 0 ? (
            <ul className="mt-5 space-y-4" lang={language}>
              {view.purposes.map((p) => (
                <li key={p.key} className="border-l-2 border-white/20 pl-4">
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                    {p.name}
                    <Badge tone={p.essential ? "muted" : "outline"}>{p.essential ? "Always on" : "Only with your consent"}</Badge>
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-fog/90">{p.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-fog/90" lang={language}>{view.notice.intro}</p>
          )}
          <Link href={`/p/${siteKey}/notice${q}`} className="mt-6 inline-block text-sm underline decoration-white/30 underline-offset-4 hover:decoration-white">
            Read the full privacy notice
          </Link>
        </Section>

        <Section title="Cookies and trackers">
          {!view.lastCheckedAt ? (
            <p className="text-sm text-fog/90">HighPre hasn&apos;t checked this website for trackers yet.</p>
          ) : view.trackers.length === 0 && view.cookies.length === 0 ? (
            <p className="text-sm text-fog/90">No third-party trackers or cookies were found when HighPre last checked {view.siteHost}.</p>
          ) : (
            <>
              {view.trackers.length > 0 && (
                <ul className="divide-y divide-white/[0.08] rounded-panel border border-white/10">
                  {view.trackers.map((t) => (
                    <li key={t.name} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="mt-0.5 text-2xs text-mist">{t.category}</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-fog/90">{t.purpose}</p>
                      </div>
                      <Badge tone={t.waitsForConsent ? "muted" : "warning"}>{t.waitsForConsent ? "Covered by the consent banner" : "No consent banner found"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {view.cookies.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs text-mist">Cookies the website set when its pages first loaded:</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {view.cookies.map((c) => (
                      <li key={c.name} className="rounded-full border border-white/10 px-3 py-1 font-mono text-2xs text-fog">
                        {c.name}
                        {c.essential && <span className="ml-2 font-sans text-mist">needed for the site</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 text-2xs leading-relaxed text-mist">
                Found by reading the website&apos;s pages. Tools added later by scripts may not appear here.
              </p>
            </>
          )}
        </Section>

        {view.vendors && (
          <Section title="Service providers">
            <p className="text-xs text-mist">Companies that process personal data on {view.businessName}&apos;s behalf.</p>
            {view.vendors.length === 0 ? (
              <p className="mt-4 text-sm text-fog/90">None listed.</p>
            ) : (
              <ul className="mt-4 divide-y divide-white/[0.08] rounded-panel border border-white/10">
                {view.vendors.map((v) => (
                  <li key={v.name} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3.5">
                    <span className="text-sm">{v.name}</span>
                    <span className="text-xs text-mist">
                      {v.category}
                      {v.country ? ` · ${v.country}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section title="Change your cookie choices">
          <p className="text-sm leading-relaxed text-fog/90">
            On {view.siteHost},{" "}
            {view.reopenButton ? (
              <>
                use the round privacy button in the bottom corner of any page (labelled <span lang={language} className="text-paper">&ldquo;{settingsLabel}&rdquo;</span>)
              </>
            ) : (
              "use the privacy settings link the website provides, usually in the page footer,"
            )}{" "}
            to see your choices, change them or withdraw consent at any time. Withdrawing is as easy as giving consent, and it applies from that moment.
          </p>
          <a
            href={view.siteUrl}
            rel="noopener"
            className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-full border border-white/20 px-5 text-xs font-medium transition-colors hover:border-white/50 hover:bg-white/5"
          >
            Go to {view.siteHost}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </a>
        </Section>

        <Section title="Contact">
          {view.contact ? (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[160px_1fr]">
              {view.contact.officer && (
                <>
                  <dt className="text-xs text-mist sm:pt-0.5">Grievance officer</dt>
                  <dd>{view.contact.officer}</dd>
                </>
              )}
              {view.contact.email && (
                <>
                  <dt className="text-xs text-mist sm:pt-0.5">Email</dt>
                  <dd className="break-all">
                    <a href={`mailto:${view.contact.email}`} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">{view.contact.email}</a>
                  </dd>
                </>
              )}
              {view.contact.phone && (
                <>
                  <dt className="text-xs text-mist sm:pt-0.5">Phone</dt>
                  <dd>
                    <a href={`tel:${view.contact.phone.replace(/[^\d+]/g, "")}`} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">{view.contact.phone}</a>
                  </dd>
                </>
              )}
              <dt className="text-xs text-mist sm:pt-0.5">Response time</dt>
              <dd>Within {view.contact.responseDays} days</dd>
            </dl>
          ) : (
            <p className="text-sm text-fog/90">
              Use the <Link href={`/p/${siteKey}/rights${q}`} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">data request page</Link> to contact {view.businessName} about your data.
            </p>
          )}
          <p className="mt-6 text-xs leading-relaxed text-mist">
            If you&apos;re not satisfied with the response, you can complain to the Data Protection Board of India.
          </p>
        </Section>
      </div>

      <p className="mt-14 border-t border-white/10 pt-6 text-2xs leading-relaxed text-mist">
        {view.lastCheckedAt ? `Last checked by HighPre on ${formatDate(view.lastCheckedAt)}. ` : ""}
        {view.businessName} uses HighPre to publish this page and manage consent. {view.businessName} remains responsible for how it handles your data; this page is not a certification.
      </p>
    </div>
  );
}
