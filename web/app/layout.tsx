import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PwaRegister from "@/components/PwaRegister";
import { I18nProvider } from "@/components/I18nProvider";
import InstallBanner from "@/components/InstallBanner";
import MarketingAside from "@/components/MarketingAside";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { isLocalPreview } from "@/lib/local-preview";
import { Suspense } from "react";
import AppScrollReset from "@/components/AppScrollReset";
import RouteMotion from "@/components/RouteMotion";
import SuccessFeedback from "@/components/SuccessFeedback";
import { MarketPricesProvider } from "@/components/MarketPricesProvider";
import UsernameOnboarding from "@/components/UsernameOnboarding";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://salapi.app"),
  title: "Salapi, crypto-invisible fintech for the Philippines and Indonesia",
  description:
    "Community money on Stellar Testnet. Give with proof, save together with Arisan, and send by username. No real-money donations.",
  appleWebApp: { capable: true, title: "Salapi", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "Salapi",
    title: "Salapi, crypto-invisible fintech for the Philippines and Indonesia",
    description:
      "Community money on Stellar Testnet. Proof-gated campaigns, Arisan, and payments by username.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Salapi, crypto-invisible fintech",
    description:
      "Community money on Stellar Testnet. Proof-gated campaigns, Arisan, and payments by username.",
  },
};

export const viewport: Viewport = {
  themeColor: "#F3F7FC",
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover is required for env(safe-area-inset-bottom) to
  // return non-zero on devices with system bars (iPhone home indicator,
  // Android 3-button nav). Without it, the bottom nav labels get clipped
  // by the system bar on Android.
  viewportFit: "cover",
  // Intentionally do NOT lock max-scale or user-scalable=false:
  // both fail Lighthouse a11y because they disable pinch-zoom for low-vision
  // users. The PWA shell still feels app-like without zoom locked.
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Force every route to render dynamically so the per-request CSP nonce from
  // proxy.ts is stamped into Next's inline <script> tags. A statically
  // prerendered page would ship those scripts with no nonce, and the CSP would
  // block them (blank screen). See proxy.ts.
  await connection();
  // Vercel serves these same-origin endpoints only after observability is
  // enabled for the project. Keep them explicitly opt-in so local builds and
  // deployments made before dashboard setup do not request a missing
  // `/_vercel/*` route that Next/Vercel answers with an HTML 404 document.
  const observabilityEnabled =
    process.env.VERCEL === "1" &&
    process.env.VERCEL_OBSERVABILITY_ENABLED === "1";
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh">
        <a className="sl-skip" href="#app-content">Skip to content</a>
        <PwaRegister />
        <I18nProvider>
          <MarketPricesProvider>
          <Suspense fallback={null}><UsernameOnboarding /></Suspense>
          <Suspense fallback={null}><AppScrollReset /></Suspense>
          {/* Mobile: full-screen app. Desktop (≥1024px): the same app shown as
              a phone on a calm dark backdrop with a marketing column, so the
              browser view reads as intentional instead of a lonely column. */}
          <div className="sl-shell flex min-h-dvh w-full flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-12 xl:gap-20">
            <MarketingAside />

            <div
              className="sl-app-frame relative mx-auto flex h-svh w-full max-w-[500px] flex-col overflow-hidden lg:mx-0 lg:h-[900px] lg:max-h-[94vh] lg:min-h-0 lg:flex-none lg:rounded-[32px] lg:ring-1 lg:ring-blue-900/10"
              style={{ background: "#F3F7FC" }}
            >
              <InstallBanner />
              {isLocalPreview && <div className="sl-preview-banner"><span className="sl-preview-dot" />Local preview · sample data · no transactions</div>}
              <main id="app-content" tabIndex={-1} className="sl-main flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+90px)]">
                <RouteMotion>{children}</RouteMotion>
              </main>
              <SuccessFeedback />
              <BottomNav />
            </div>
          </div>
          </MarketPricesProvider>
        </I18nProvider>
        {/* Vercel Web Analytics (traffic) + Speed Insights (Core Web Vitals).
            Same-origin (/_vercel/insights/*), so the nonce CSP + strict-dynamic
            in proxy.ts cover them with no policy change. Data appears once
            Analytics/Speed Insights are enabled in the Vercel project. */}
        {observabilityEnabled && <Analytics />}
        {observabilityEnabled && <SpeedInsights />}
      </body>
    </html>
  );
}
