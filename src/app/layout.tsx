import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "HighPre — DPDP compliance for Indian websites", template: "%s · HighPre" },
  description:
    "Scan your website, publish a privacy notice in English, Hindi and six more Indian languages, record consent and handle data requests. Get ready for India's DPDP Act before 13 May 2027.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "HighPre — DPDP compliance for Indian websites",
    description: "Get your website ready for India's privacy law before 13 May 2027.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
