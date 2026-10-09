import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Start free" },
];

export function SiteFooter() {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:gap-8 sm:px-6 sm:py-12">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-xs leading-relaxed text-mist">
            HighPre is software, not a law firm, and doesn&apos;t provide legal advice.
          </p>
        </div>
        <nav aria-label="Footer" className="-mx-3 flex flex-wrap text-sm text-mist sm:mx-0 sm:gap-8 sm:text-xs">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="inline-flex min-h-11 items-center px-3 transition-colors hover:text-paper sm:min-h-0 sm:px-0">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-10 text-2xs text-mist/70 sm:px-6">© {new Date().getFullYear()} HighPre</p>
    </footer>
  );
}
