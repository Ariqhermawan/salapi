import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PwaRegister from "@/components/PwaRegister";
import { I18nProvider } from "@/components/I18nProvider";
import InstallBanner from "@/components/InstallBanner";
import MarketingAside from "@/components/MarketingAside";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Salapi, crypto-invisible fintech for the Philippines and Indonesia",
  description:
    "GCash-funded Stellar wallet: disaster relief, paluwagan, smart savings, P2P. Crypto invisible.",
  appleWebApp: { capable: true, title: "Salapi", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#0B1220",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
              className="relative mx-auto flex min-h-dvh w-full max-w-[460px] flex-col lg:mx-0 lg:h-[860px] lg:max-h-[94vh] lg:min-h-0 lg:flex-none lg:overflow-hidden lg:rounded-[40px] lg:shadow-[0_60px_120px_-30px_rgba(11,18,32,0.55)] lg:ring-1 lg:ring-black/10"
              style={{ background: "#F4F6FB" }}
            >
              <InstallBanner />
              <main className="flex-1 overflow-y-auto pb-[92px]">
                {children}
              </main>
              <BottomNav />
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
