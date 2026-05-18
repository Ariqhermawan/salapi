import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import PwaRegister from "@/components/PwaRegister";
import { I18nProvider } from "@/components/I18nProvider";
import InstallBanner from "@/components/InstallBanner";

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
  themeColor: "#1d4ed8",
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
        <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col bg-[var(--color-surface)] shadow-[0_0_60px_rgba(11,18,32,0.06)]">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-hairline)] bg-white/85 px-5 py-3.5 backdrop-blur">
            <span className="text-lg font-extrabold tracking-tight text-[var(--color-ink)]">
              Salapi<span className="text-[var(--color-action)]">.</span>
            </span>
            <div className="flex items-center gap-2.5">
              <Link
                href="/settings"
                aria-label="Language & settings"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-hairline)] text-[var(--color-slate)]"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
                </svg>
              </Link>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-warn)]">
                Testnet
              </span>
            </div>
          </header>

          <InstallBanner />
          <main className="flex-1 overflow-y-auto pb-28">{children}</main>

          <div className="pointer-events-none fixed bottom-0 left-1/2 z-20 w-full max-w-[460px] -translate-x-1/2">
            <div className="pointer-events-auto border-t border-[var(--color-hairline)] bg-white/95 backdrop-blur">
              <p className="py-1.5 text-center text-[10px] font-medium tracking-wide text-[var(--color-slate)]">
                ✦ Powered by Stellar · testnet
              </p>
              <BottomNav />
            </div>
          </div>
        </div>
        </I18nProvider>
      </body>
    </html>
  );
}
