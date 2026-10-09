import { CubeField } from "@/components/graphics/cube-field";
import { ScanForm } from "@/components/scanner/scan-form";

export function ClosingCta() {
  return (
    <section className="px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-sheet border hairline">
        <CubeField className="absolute inset-0 opacity-50" cols={26} rows={26} size={44} seed={21} animate={false} verifiedRatio={0.2} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black" />
        <div className="relative flex flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-32">
          <h2 className="max-w-2xl text-[2rem] font-semibold leading-[1.1] tracking-[-0.03em] text-balance sm:text-3xl">See what your website collects today.</h2>
          <p className="mt-4 max-w-md text-sm text-mist">Free scan, no account needed. Results in under a minute.</p>
          <ScanForm className="mt-8 flex justify-center sm:mt-10" />
        </div>
      </div>
    </section>
  );
}
