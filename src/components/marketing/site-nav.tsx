"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

const links = [
  { href: "/#why-it-matters", label: "Why it matters" },
  { href: "/#what-it-does", label: "What it does" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // While the menu is open: Escape closes it (focus back on the toggle), focus
  // moves into the panel, and it closes if the screen widens to the desktop nav.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const desktop = window.matchMedia("(min-width: 768px)");
    const onWide = () => desktop.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-4 sm:top-4">
      <nav className="glass-strong mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 rounded-full pl-5 pr-2" aria-label="Main">
        <Logo className="min-h-11 shrink-0" />
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
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden md:inline-flex">
            Log in
          </ButtonLink>
          <ButtonLink href="/register" size="sm" className="max-md:!h-11 max-md:!px-5">
            Start free
          </ButtonLink>
          <button
            ref={buttonRef}
            type="button"
            className="grid size-11 place-items-center rounded-full text-fog transition-colors hover:bg-white/5 hover:text-paper md:hidden"
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </nav>

      <div
        ref={panelRef}
        id="site-menu"
        hidden={!open}
        className="glass-strong mx-auto mt-2 max-w-5xl rounded-sheet p-2 shadow-2xl md:hidden"
      >
        <ul>
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-2xl px-4 text-base text-fog transition-colors hover:bg-white/5 hover:text-paper"
              >
                {l.label}
              </a>
            </li>
          ))}
          <li className="mt-1 border-t hairline pt-1">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center rounded-2xl px-4 text-base text-fog transition-colors hover:bg-white/5 hover:text-paper"
            >
              Log in
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
