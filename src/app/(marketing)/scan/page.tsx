import type { Metadata } from "next";
import { ScanForm } from "@/components/scanner/scan-form";
import { ScanReport } from "@/components/scanner/scan-report";

export const metadata: Metadata = { title: "Free DPDP website scan", robots: { index: false } };

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ url?: string }> }) {
  const { url } = await searchParams;
  return (
    <div className="min-h-dvh px-4 pb-16 pt-24 sm:px-6 sm:pb-24 sm:pt-36">
      {url ? (
        <ScanReport key={url} url={url} />
      ) : (
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <h1 className="text-2xl font-semibold">Scan your website</h1>
          <p className="mt-3 text-sm text-mist">Find the forms, trackers and gaps that matter under DPDP.</p>
          <ScanForm className="mt-8 flex justify-center sm:mt-10" autoFocus />
        </div>
      )}
    </div>
  );
}
