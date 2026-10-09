import { Plus } from "lucide-react";
import { faqs } from "@/content/landing";

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 sm:scroll-mt-28 sm:px-6 sm:py-36">
      <h2 className="text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-3xl">Questions people ask first</h2>
      <div className="mt-8 border-t hairline sm:mt-12">
        {faqs.map((f) => (
          <details key={f.q} className="group border-b hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium sm:gap-6 sm:py-6 [&::-webkit-details-marker]:hidden">
              {f.q}
              <Plus className="size-4 shrink-0 text-mist transition-transform duration-500 ease-apple group-open:rotate-45" aria-hidden />
            </summary>
            <p className="max-w-2xl pb-6 pr-8 text-sm leading-relaxed text-mist sm:pb-7">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
