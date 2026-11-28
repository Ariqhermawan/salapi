import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Outfit, Geist_Mono } from "next/font/google";
import "@fontsource-variable/outfit";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PwaRegister from "@/components/PwaRegister";
import { I18nProvider } from "@/components/I18nProvider";
import InstallBanner from "@/components/InstallBanner";
import MarketingAside from "@/components/MarketingAside";
import PrototypePreviewAside from "@/components/PrototypePreviewAside";
import { StatusBarIcons, StatusBarTime } from "@/components/PrototypeStatusBar";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { isLocalPreview } from "@/lib/local-preview";
import { Suspense } from "react";
import AppScrollReset from "@/components/AppScrollReset";
import RouteMotion from "@/components/RouteMotion";
import SuccessFeedback from "@/components/SuccessFeedback";
import { MarketPricesProvider } from "@/components/MarketPricesProvider";
import UsernameOnboarding from "@/components/UsernameOnboarding";
import PrototypeRoomFill from "@/components/PrototypeRoomFill";

const outfit = Outfit({ variable: "--font-geist-sans", preload: false });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  preload: false,
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
  themeColor: "#f7f7f7",
  colorScheme: "light",
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
  const nonce = (await headers()).get("x-nonce") ?? undefined;
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
      data-theme="light"
      data-local-preview={isLocalPreview ? "true" : undefined}
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `(()=>{const query=window.matchMedia("(min-width: 1024px)");const apply=()=>{document.documentElement.dataset.theme=query.matches?"dark":"light"};apply();if(query.addEventListener)query.addEventListener("change",apply);else query.addListener(apply)})()` }} />
        <a className="sl-skip" href="#app-content">Skip to content</a>
        <PwaRegister />
        <I18nProvider>
          <MarketPricesProvider>
          <Suspense fallback={null}><UsernameOnboarding /></Suspense>
          <Suspense fallback={null}><AppScrollReset /></Suspense>
          <div className="sl-shell sl-shell-preview flex min-h-dvh w-full flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-12 xl:gap-20">
            <div className="sl-preview-device-slot">
              <div className="sl-preview-device">
                <div className="sl-app-frame sl-app-frame-preview relative mx-auto flex h-svh w-full max-w-[390px] flex-col overflow-hidden">
                  <div className="sl-prototype-statusbar" aria-hidden="true"><StatusBarTime /><StatusBarIcons /></div>
                  <div className="sl-preview-status-spacer" />
                  {!isLocalPreview && <InstallBanner />}
                  <main id="app-content" tabIndex={-1} className="sl-main flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+90px)]">
                    <RouteMotion>{children}</RouteMotion>
                    {isLocalPreview ? <PrototypeRoomFill /> : null}
                  </main>
                  <SuccessFeedback />
                  <BottomNav />
                  <div id="phone-layer" className="pointer-events-none absolute inset-0 z-[100]" />
                  <div className="sl-preview-home-indicator" aria-hidden="true" />
                </div>
                <span className="sl-preview-island" aria-hidden="true" />
                <span className="sl-preview-device-button sl-preview-device-button-action" aria-hidden="true" />
                <span className="sl-preview-device-button sl-preview-device-button-up" aria-hidden="true" />
                <span className="sl-preview-device-button sl-preview-device-button-down" aria-hidden="true" />
                <span className="sl-preview-device-button sl-preview-device-button-power" aria-hidden="true" />
              </div>
            </div>
            {isLocalPreview ? <PrototypePreviewAside /> : <MarketingAside />}
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
