import { Plus } from "lucide-react";
import { faqs } from "@/content/landing";

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-28 px-6 py-28 sm:py-36">
      <h2 className="text-2xl font-semibold sm:text-3xl">Questions people ask first</h2>
      <div className="mt-12 border-t hairline">
        {faqs.map((f) => (
          <details key={f.q} className="group border-b hairline">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-base font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <Plus className="size-4 shrink-0 text-mist transition-transform duration-500 ease-apple group-open:rotate-45" aria-hidden />
            </summary>
            <p className="max-w-2xl pb-7 text-sm leading-relaxed text-mist">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
