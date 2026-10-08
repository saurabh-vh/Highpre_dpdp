import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";

/** Page title with an optional back link, description and actions. */
export function PageHeader({ title, description, actions, back, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <header className="mb-8">
      {back && (
        <Link href={back.href} className="mb-5 inline-flex items-center gap-1 text-xs text-mist transition-colors hover:text-paper">
          <ChevronLeft className="size-3.5" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5 text-xs text-mist">{eyebrow}</div>}
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-sm text-mist text-pretty">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
