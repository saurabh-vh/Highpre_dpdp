import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#what-you-get", label: "What you get" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteNav() {
  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <nav className="glass-strong mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full pl-5 pr-2" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-full px-3.5 py-2 text-xs text-fog transition-colors duration-300 hover:text-paper">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-1">
          <ButtonLink href="/login" variant="ghost" size="sm">
            Log in
          </ButtonLink>
          <ButtonLink href="/register" size="sm">
            Start free
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}
