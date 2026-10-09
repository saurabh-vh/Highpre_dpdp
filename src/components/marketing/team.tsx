import { BarChart3, EyeOff, FileSearch, LaptopMinimalCheck, ShieldCheck, User, UserRoundCheck, type LucideIcon } from "lucide-react";
import { team } from "@/content/landing";
import { AgentHowItWorksIllustration, ExtensionIllustration } from "@/components/illustrations/feature-illustrations";
import { Reveal } from "@/components/motion/reveal";

const icons: Record<(typeof team.features)[number]["id"], LucideIcon> = {
  files: FileSearch,
  mask: EyeOff,
  ai: BarChart3,
  gaps: LaptopMinimalCheck,
};
const trustIcons = [User, UserRoundCheck, ShieldCheck];

/** The team section: catching honest mistakes without surveillance. */
export function Team() {
  return (
    <section id="for-your-team" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 sm:scroll-mt-28 sm:px-6 sm:py-32">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-mist">For your team</p>
          <h2 className="mt-3 text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-3xl">{team.title}</h2>
          <p className="mt-4 max-w-xl text-sm text-mist sm:text-base">{team.subtitle}</p>
        </Reveal>
        <Reveal delay={120}>
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
            <div className="rounded-panel border hairline bg-white/[0.02] p-3">
              <AgentHowItWorksIllustration className="w-full border-0 bg-transparent p-0" />
            </div>
            <div className="rounded-panel border hairline bg-white/[0.02] p-3">
              <ExtensionIllustration className="w-full border-0 bg-transparent p-0" />
            </div>
          </div>
        </Reveal>
      </div>

      <div className="mt-12 grid gap-3 sm:mt-16 sm:grid-cols-2">
        {team.features.map((f, i) => {
          const Icon = icons[f.id];
          return (
            <Reveal key={f.id} delay={i * 80} className="h-full">
              <div className="flex h-full gap-4 rounded-panel border hairline bg-white/[0.02] p-6">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                  <Icon className="size-5 text-fog" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-medium">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-mist">{f.body}</p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal className="mt-12 sm:mt-16">
        <ul className="grid divide-y divide-white/[0.08] rounded-sheet border hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          {team.trust.map((t, i) => {
            const Icon = trustIcons[i];
            return (
              <li key={t.who} className="p-6">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Icon className={i === 2 ? "size-4 text-success" : "size-4 text-fog"} aria-hidden />
                  {t.who}
                </p>
                <p className="mt-2 text-sm text-mist">{t.what}</p>
              </li>
            );
          })}
        </ul>
      </Reveal>
    </section>
  );
}
