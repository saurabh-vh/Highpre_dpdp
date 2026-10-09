import Link from "next/link";
import { hero } from "@/content/landing";
import { ScanForm } from "@/components/scanner/scan-form";
import { DeadlineSentence } from "./countdown";
import { HeroVisual } from "./hero-visual";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-24 sm:pt-36">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-4 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative z-10 min-w-0 py-8 lg:py-24">
          <h1 className="animate-rise-in text-[clamp(2.25rem,1.4rem+3.6vw,4.75rem)] font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:leading-[0.98] sm:tracking-[-0.045em]">
            {hero.title}
          </h1>
          <p className="mt-5 max-w-xl animate-rise-in text-base text-fog/90 text-pretty sm:mt-7 sm:text-lg" style={{ animationDelay: "120ms" }}>
            {hero.subtitle}
          </p>
          <div className="mt-8 animate-rise-in sm:mt-10" style={{ animationDelay: "240ms" }}>
            <ScanForm />
            <DeadlineSentence className="mt-4 px-2 text-xs text-mist sm:mt-5 sm:pl-5 sm:pr-0" />
          </div>
          <p className="mt-3 animate-rise-in px-2 text-xs text-mist sm:mt-5 sm:pl-5 sm:pr-0" style={{ animationDelay: "360ms" }}>
            Already know what you need?{" "}
            <Link
              href="/register"
              className="inline-block py-3 text-paper underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
            >
              Create a free account
            </Link>
          </p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
