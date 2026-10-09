import { ArrowRight, Check, X } from "lucide-react";
import { beforeAfter, stakes } from "@/content/landing";
import { Reveal } from "@/components/motion/reveal";

/** Why the DPDP Act matters, and what changes with HighPre. */
export function Stakes() {
  return (
    <section id="why-it-matters" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:scroll-mt-28 sm:px-6 sm:py-32">
      <Reveal>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-mist">Why it matters</p>
        <h2 className="mt-3 max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-3xl">
          The DPDP Act is not a formality.
        </h2>
        <p className="mt-4 max-w-2xl text-sm text-mist sm:text-base">
          It applies to almost every business in India. Even one phone number from a contact form counts.
        </p>
      </Reveal>

      <div className="mt-10 grid grid-cols-1 gap-3 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
        {stakes.map((s, i) => (
          <Reveal key={s.figure} delay={i * 80}>
            <div className="h-full rounded-panel border hairline bg-white/[0.02] p-6">
              <p className="text-2xl font-semibold tracking-[-0.03em] tabular-nums sm:text-[2rem]">{s.figure}</p>
              <p className="mt-2 text-sm text-mist">{s.label}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal className="mt-16 sm:mt-24">
        <h3 className="text-lg font-semibold tracking-tight sm:text-xl">Where most websites stand today, and what HighPre changes.</h3>
        <ul className="mt-6 divide-y divide-white/[0.08] rounded-panel border hairline">
          {beforeAfter.map((row) => (
            <li key={row.before} className="grid gap-3 p-5 sm:p-6 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
              <p className="flex gap-3 text-sm text-mist">
                <X className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span>
                  <span className="sr-only">Today: </span>
                  {row.before}
                </span>
              </p>
              <ArrowRight className="hidden size-4 text-white/30 md:block" aria-hidden />
              <p className="flex gap-3 text-sm text-paper">
                <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                <span>
                  <span className="sr-only">With HighPre: </span>
                  {row.after}
                </span>
              </p>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
