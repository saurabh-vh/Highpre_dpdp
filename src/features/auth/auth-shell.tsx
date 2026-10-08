import type { ReactNode } from "react";
import { LogoMark, Logo } from "@/components/brand/logo";
import { CubeField } from "@/components/graphics/cube-field";

/** Split-screen frame for auth pages: cube field on the left, form on the right. */
export function AuthShell({ asideTitle, asideBody, children }: { asideTitle: string; asideBody: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r hairline lg:block">
        <CubeField className="absolute inset-0" cols={22} rows={22} size={56} seed={3} cycleSeconds={9} />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-black/40" />
        <div className="absolute inset-x-10 bottom-10 animate-rise-in">
          <LogoMark className="mb-8 h-14 text-paper" />
          <div className="glass-strong rounded-panel p-7">
            <p className="text-xl font-semibold tracking-tight">{asideTitle}</p>
            <p className="mt-2 max-w-md text-sm text-fog/80">{asideBody}</p>
          </div>
        </div>
      </aside>

      <main className="relative flex flex-col px-6 py-8 sm:px-12">
        <Logo className="lg:hidden" />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-10 animate-rise-in">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-mist">{subtitle}</p>
    </div>
  );
}
