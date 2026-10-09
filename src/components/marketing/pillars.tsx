import { Check } from "lucide-react";
import { pillars } from "@/content/landing";
import { AgentHowItWorksIllustration, BrandColorsIllustration, FormsIllustration } from "@/components/illustrations/feature-illustrations";
import { Reveal } from "@/components/motion/reveal";

const pictures = {
  website: <BrandColorsIllustration className="w-full border-0 bg-transparent p-0" />,
  team: <AgentHowItWorksIllustration className="w-full border-0 bg-transparent p-0" />,
  proof: <FormsIllustration className="w-full border-0 bg-transparent p-0" />,
} as const;

/** What HighPre does, in three parts. */
export function Pillars() {
  return (
    <section id="what-it-does" className="scroll-mt-24 border-y hairline bg-graphite/40 sm:scroll-mt-28">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-32">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-mist">What HighPre does</p>
          <h2 className="mt-3 max-w-3xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-3xl">
            Your website, your team and your proof. Covered.
          </h2>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-14 lg:grid-cols-3">
          {pillars.map((p, i) => (
            <Reveal key={p.id} delay={i * 100} className="h-full">
              <article className="flex h-full flex-col rounded-sheet border hairline bg-black/40 p-6">
                <div className="flex min-h-[150px] items-center justify-center rounded-panel border hairline bg-white/[0.02] p-3">{pictures[p.id]}</div>
                <h3 className="mt-6 text-lg font-semibold tracking-tight">{p.title}</h3>
                <p className="mt-1 text-sm text-mist">{p.pitch}</p>
                <ul className="mt-5 space-y-2.5">
                  {p.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-fog">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
