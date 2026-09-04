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

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://salapi.app"),
  title: "Salapi, crypto-invisible fintech for the Philippines and Indonesia",
  description:
    "GCash-funded Stellar wallet: disaster relief, paluwagan, smart savings, P2P. Crypto invisible.",
  appleWebApp: { capable: true, title: "Salapi", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    siteName: "Salapi",
    title: "Salapi, crypto-invisible fintech for the Philippines and Indonesia",
    description:
      "GCash-funded Stellar wallet: disaster relief, paluwagan, smart savings, P2P. Crypto invisible.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Salapi, crypto-invisible fintech",
    description:
      "GCash-funded Stellar wallet: disaster relief, paluwagan, smart savings, P2P. Crypto invisible.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
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
        <PwaRegister />
        <I18nProvider>
          {/* Mobile: full-screen app. Desktop (≥1024px): the same app shown as
              a phone on a calm dark backdrop with a marketing column, so the
              browser view reads as intentional instead of a lonely column. */}
          <div className="sl-shell flex min-h-dvh w-full flex-col lg:flex-row lg:items-center lg:justify-center lg:gap-12 xl:gap-20">
            <MarketingAside />

            <div
              className="relative mx-auto flex h-svh w-full max-w-[460px] flex-col overflow-hidden lg:mx-0 lg:h-[860px] lg:max-h-[94vh] lg:min-h-0 lg:flex-none lg:rounded-[40px] lg:shadow-[0_60px_120px_-30px_rgba(11,18,32,0.55)] lg:ring-1 lg:ring-black/10"
              style={{ background: "#F4F6FB" }}
            >
              <InstallBanner />
              <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+60px)]">
                {children}
              </main>
              <BottomNav />
            </div>
          </div>
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
