import { ClosingCta } from "@/components/marketing/closing-cta";
import { Faq } from "@/components/marketing/faq";
import { Hero } from "@/components/marketing/hero";
import { Obligations } from "@/components/marketing/obligations";
import { Pricing } from "@/components/marketing/pricing";
import { Steps } from "@/components/marketing/steps";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Obligations />
      <Steps />
      <Pricing />
      <Faq />
      <ClosingCta />
    </>
  );
}
