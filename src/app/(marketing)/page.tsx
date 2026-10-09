import { ClosingCta } from "@/components/marketing/closing-cta";
import { Faq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { Obligations } from "@/components/marketing/obligations";
import { Pillars } from "@/components/marketing/pillars";
import { Pricing } from "@/components/marketing/pricing";
import { Stakes } from "@/components/marketing/stakes";
import { Steps } from "@/components/marketing/steps";
import { Team } from "@/components/marketing/team";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Stakes />
      <Pillars />
      <Team />
      <Obligations />
      <Steps />
      <Pricing />
      <Faq />
      <ClosingCta />
    </>
  );
}
