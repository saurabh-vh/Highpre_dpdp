import { CubeField } from "@/components/graphics/cube-field";
import { ScanForm } from "@/components/scanner/scan-form";

export function ClosingCta() {
  return (
    <section className="px-4 pb-24">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-sheet border hairline">
        <CubeField className="absolute inset-0 opacity-50" cols={26} rows={26} size={44} seed={21} animate={false} verifiedRatio={0.2} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-black" />
        <div className="relative flex flex-col items-center px-6 py-24 text-center sm:py-32">
          <h2 className="max-w-2xl text-2xl font-semibold text-balance sm:text-3xl">See what your website collects today.</h2>
          <p className="mt-4 max-w-md text-sm text-mist">Free scan, no account needed. Results in under a minute.</p>
          <ScanForm className="mt-10 flex justify-center" />
        </div>
      </div>
    </section>
  );
}
