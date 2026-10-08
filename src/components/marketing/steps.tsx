import { steps } from "@/content/landing";
import { BannerPreview } from "@/components/consent/banner-preview";

const snippet = `<script src="https://highpre.com/widget.js"
  data-hp-site="your-site-key" async></script>`;

export function Steps() {
  return (
    <section id="how-it-works" className="relative scroll-mt-28 border-y hairline bg-graphite/40">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-28 sm:py-36 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <h2 className="text-2xl font-semibold text-balance sm:text-3xl">Ready in an afternoon.</h2>
          <p className="mt-4 max-w-md text-sm text-mist sm:text-base">No consultants, no legal jargon. Three steps, in this order.</p>
          <ol className="mt-12 space-y-10">
            {steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                <span className="grid size-10 place-items-center rounded-full border border-white/20 text-sm font-medium tabular-nums">{i + 1}</span>
                <div className="pt-1.5">
                  <h3 className="text-base font-medium">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-mist">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative flex flex-col justify-center gap-6">
          <div className="glass rounded-sheet p-2">
            <div className="flex items-center gap-1.5 px-4 py-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="ml-3 text-2xs text-mist">index.html</span>
            </div>
            <pre className="overflow-x-auto rounded-[20px] bg-black/60 p-6 font-mono text-xs leading-relaxed text-fog">
              <code>{snippet}</code>
            </pre>
          </div>
          <BannerPreview
            className="self-end"
            title="Your privacy, your choice"
            message="We use your data only for the purposes below. Choose what you're comfortable with — you can change this anytime."
          />
        </div>
      </div>
    </section>
  );
}
