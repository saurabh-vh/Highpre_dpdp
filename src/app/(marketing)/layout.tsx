import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

/** HighPre's own consent banner on its public pages (site key from the HighPre dashboard). */
const HIGHPRE_SITE_SCRIPT = "/s/VL1SFbZr-QbizdS2.js";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-sync-scripts -- must run before any tag, as customers are told to install it */}
      <script src={HIGHPRE_SITE_SCRIPT} />
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
