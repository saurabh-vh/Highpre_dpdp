import { obligations } from "@/content/landing";
import { Reveal } from "@/components/motion/reveal";

/** What the law asks, set against what HighPre does about it. */
export function Obligations() {
  return (
    <section id="what-you-get" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:scroll-mt-28 sm:px-6 sm:py-36">
      <Reveal>
        <h2 className="max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-3xl">
          Six things the law asks. HighPre handles each one.
        </h2>
      </Reveal>
      <dl className="mt-10 border-t hairline sm:mt-16">
        {obligations.map((o) => (
          <div key={o.law} className="grid gap-2 border-b hairline py-6 sm:gap-3 sm:py-8 md:grid-cols-[1fr_1fr] md:gap-12">
            <dt className="text-base font-medium tracking-tight sm:text-lg">{o.law}</dt>
            <dd className="text-sm text-mist md:text-base">{o.fix}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
