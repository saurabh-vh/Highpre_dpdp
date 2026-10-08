import { ButtonLink } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <LogoMark className="mx-auto mb-8 h-10" />
        <h1 className="text-2xl font-semibold">This page doesn&apos;t exist</h1>
        <p className="mt-2 text-sm text-mist">The link may be old, or the page may have moved.</p>
        <ButtonLink href="/" className="mt-8">Go to HighPre</ButtonLink>
      </div>
    </main>
  );
}
