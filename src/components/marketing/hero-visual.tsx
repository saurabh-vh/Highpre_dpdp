import { Check, FileText, ShieldCheck } from "lucide-react";
import { CubeField } from "@/components/graphics/cube-field";
import { BannerPreview } from "@/components/consent/banner-preview";

/**
 * The hero's one big moment: a field of data blocks being scanned, with
 * product surfaces floating above it. The cards illustrate the product; they
 * are not statistics. On phones the field is shorter and still, and only the
 * banner and one card are shown so nothing crowds the text above.
 */
export function HeroVisual() {
  return (
    <div className="relative h-[460px] w-full min-w-0 sm:h-[600px]">
      <CubeField className="fade-edges absolute -inset-x-10 inset-y-0" cols={20} rows={20} size={46} verifiedRatio={0.08} staticOnMobile />

      <div className="absolute inset-0 animate-rise-in" style={{ animationDelay: "500ms" }}>
        <BannerPreview
          className="absolute inset-x-0 top-[4%] mx-auto sm:left-auto sm:right-[6%] sm:top-[14%] sm:mx-0"
          title="Your privacy, your choice"
          message="We use your data only for the purposes below. Change your mind anytime."
          purposes={[
            { key: "essential", name: "Essential site operation", essential: true },
            { key: "enquiries", name: "Responding to enquiries", essential: false },
          ]}
        />
      </div>

      <div
        className="glass-strong absolute bottom-[4%] left-[4%] flex animate-rise-in items-center gap-3 rounded-2xl py-3 pl-3 pr-5 sm:bottom-[18%]"
        style={{ animationDelay: "800ms" }}
      >
        <span className="grid size-9 place-items-center rounded-xl bg-paper text-ink">
          <Check className="size-4" strokeWidth={2.4} aria-hidden />
        </span>
        <span>
          <span className="block text-xs font-medium">Consent recorded</span>
          <span className="block text-2xs text-mist">Notice version 3, English</span>
        </span>
      </div>

      <div
        className="glass-strong absolute bottom-[6%] right-[10%] hidden animate-rise-in items-center gap-3 rounded-2xl py-3 pl-3 pr-5 sm:flex"
        style={{ animationDelay: "1050ms" }}
      >
        <span className="grid size-9 place-items-center rounded-xl border border-white/20">
          <FileText className="size-4" strokeWidth={1.8} aria-hidden />
        </span>
        <span>
          <span className="block text-xs font-medium">Erasure request verified</span>
          <span className="block text-2xs text-mist">Due in 12 days</span>
        </span>
      </div>

      <div
        className="glass-strong absolute left-[10%] top-[10%] hidden animate-rise-in items-center gap-2 rounded-full py-2 pl-2.5 pr-4 text-2xs sm:flex"
        style={{ animationDelay: "1250ms" }}
      >
        <ShieldCheck className="size-3.5" strokeWidth={1.8} aria-hidden />
        Meta Pixel held until consent
      </div>
    </div>
  );
}
