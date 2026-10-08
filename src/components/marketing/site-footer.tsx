import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export function SiteFooter() {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 text-xs leading-relaxed text-mist">
            HighPre is software, not a law firm, and doesn&apos;t provide legal advice.
          </p>
        </div>
        <nav aria-label="Footer" className="flex gap-8 text-xs text-mist">
          <Link href="/privacy" className="transition-colors hover:text-paper">Privacy</Link>
          <Link href="/login" className="transition-colors hover:text-paper">Log in</Link>
          <Link href="/register" className="transition-colors hover:text-paper">Start free</Link>
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-6 pb-10 text-2xs text-mist/70">© {new Date().getFullYear()} HighPre</p>
    </footer>
  );
}
