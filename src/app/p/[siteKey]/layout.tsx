import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";

/** Public pages hosted on behalf of a customer's website. */
export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6 sm:py-24">{children}</main>
      <footer className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6 sm:pb-10">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-2xs text-mist transition-colors hover:text-paper">
          <LogoMark className="h-3.5" />
          Powered by HighPre
        </Link>
      </footer>
    </div>
  );
}
