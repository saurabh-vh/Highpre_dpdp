import Link from "next/link";
import { cn } from "@/lib/utils";

/** The H! mark. Drawn as SVG so it stays crisp at every size. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 36" className={cn("h-7 w-auto", className)} fill="currentColor" aria-hidden>
      <path d="M0 0h7v15h14V0h7v36h-7V21H7v15H0z" />
      <path d="M32.5 0h7l-1.2 26h-4.6z" />
      <circle cx="36" cy="32.2" r="3.8" />
    </svg>
  );
}

export function Logo({ href = "/", className, withWordmark = true }: { href?: string; className?: string; withWordmark?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5 text-paper", className)} aria-label="HighPre home">
      <LogoMark className="h-6" />
      {withWordmark && <span className="text-base font-semibold tracking-tight">HighPre</span>}
    </Link>
  );
}
