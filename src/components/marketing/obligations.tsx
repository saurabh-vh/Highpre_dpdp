import { obligations } from "@/content/landing";
import { Reveal } from "@/components/motion/reveal";

/** What the law asks, set against what HighPre does about it. */
export function Obligations() {
  return (
    <section id="what-you-get" className="mx-auto max-w-6xl scroll-mt-28 px-6 py-28 sm:py-36">
      <Reveal>
        <h2 className="max-w-3xl text-2xl font-semibold text-balance sm:text-3xl">
          Six things the law asks of you. One place to do them.
        </h2>
      </Reveal>
      <dl className="mt-16 border-t hairline">
        {obligations.map((o) => (
          <div key={o.law} className="grid gap-3 border-b hairline py-8 md:grid-cols-[1fr_1fr] md:gap-12">
            <dt className="text-lg font-medium tracking-tight">{o.law}</dt>
            <dd className="text-sm text-mist md:text-base">{o.fix}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
