import { steps } from "@/content/landing";
import { BannerPreview } from "@/components/consent/banner-preview";

const snippet = `<script src="https://highpre.com/s/your-site-key.js"></script>`;

export function Steps() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 border-y hairline bg-graphite/40 sm:scroll-mt-28">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-20 sm:gap-16 sm:px-6 sm:py-36 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0">
          <h2 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-3xl">Ready in an afternoon.</h2>
          <p className="mt-4 max-w-md text-sm text-mist sm:text-base">No consultants, no legal jargon. Three steps, in this order.</p>
          <ol className="mt-10 space-y-8 sm:mt-12 sm:space-y-10">
            {steps.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4">
                <span className="grid size-10 place-items-center rounded-full border border-white/20 text-sm font-medium tabular-nums">{i + 1}</span>
                <div className="pt-1.5">
                  <h3 className="text-base font-medium">{s.title}</h3>
                  <p className="mt-1.5 text-sm text-mist">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative flex min-w-0 flex-col justify-center gap-6">
          <div className="glass rounded-sheet p-2">
            <div className="flex items-center gap-1.5 px-4 py-3" aria-hidden>
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="size-2.5 rounded-full bg-white/20" />
              <span className="ml-3 text-2xs text-mist">index.html</span>
            </div>
            <pre className="overflow-x-auto rounded-[20px] bg-black/60 p-4 font-mono text-xs leading-relaxed text-fog max-sm:whitespace-pre-wrap max-sm:break-all sm:p-6">
              <code>{snippet}</code>
            </pre>
          </div>
          <BannerPreview
            className="sm:self-end"
            title="Your privacy, your choice"
            message="We use your data only for the purposes below. Choose what you're comfortable with — you can change this anytime."
          />
        </div>
      </div>
    </section>
  );
}
