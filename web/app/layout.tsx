import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PwaRegister from "@/components/PwaRegister";
import { I18nProvider } from "@/components/I18nProvider";
import InstallBanner from "@/components/InstallBanner";
import { Wordmark, PoweredByStellar } from "@/components/ui/kit";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Salapi — crypto-invisible fintech for the Philippines",
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
            <aside className="hidden text-white lg:flex lg:max-w-[420px] lg:flex-col lg:gap-7 lg:px-8">
              <Wordmark size={24} c="#fff" />
              <div>
                <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.025em]">
                  Money for everyone.
                  <br />
                  Technology, invisible.
                </h1>
                <p className="mt-4 max-w-[380px] text-[15px] leading-relaxed text-white/70">
                  Open Salapi anywhere — phone, tablet or laptop. The same calm
                  app, just bigger. Pesos in, pesos out — no wallets, no chains,
                  no jargon.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl text-xl font-bold text-white"
                  style={{ background: "linear-gradient(160deg,#2563EB,#0B1220)" }}
                >
                  S.
                </div>
                <div className="text-xs leading-snug text-white/60">
                  Add to your home screen
                  <br />
                  for faster opens &amp; offline.
                </div>
              </div>
              <PoweredByStellar c="rgba(255,255,255,0.5)" />
            </aside>

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
