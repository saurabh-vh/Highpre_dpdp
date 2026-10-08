import Link from "next/link";
import { hero } from "@/content/landing";
import { ScanForm } from "@/components/scanner/scan-form";
import { DeadlineSentence } from "./countdown";
import { HeroVisual } from "./hero-visual";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 sm:pt-36">
      <div className="mx-auto grid max-w-7xl items-center gap-4 px-6 lg:grid-cols-[1.05fr_1fr]">
        <div className="relative z-10 py-8 lg:py-24">
          <h1 className="animate-rise-in text-[clamp(2.6rem,5.6vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.045em] text-balance">
            {hero.title}
          </h1>
          <p className="mt-7 max-w-xl animate-rise-in text-base text-fog/90 text-pretty sm:text-lg" style={{ animationDelay: "120ms" }}>
            {hero.subtitle}
          </p>
          <div className="mt-10 animate-rise-in" style={{ animationDelay: "240ms" }}>
            <ScanForm />
            <DeadlineSentence className="mt-5 pl-5 text-xs text-mist" />
          </div>
          <p className="mt-8 animate-rise-in pl-5 text-xs text-mist" style={{ animationDelay: "360ms" }}>
            Already know what you need?{" "}
            <Link href="/register" className="text-paper underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white">
              Create a free account
            </Link>
          </p>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
