import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import PwaRegister from "@/components/PwaRegister";

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
      <body className="min-h-dvh bg-zinc-100 text-zinc-900">
        <PwaRegister />
        {/* Mobile-first "phone" frame, full-bleed on small screens */}
        <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-white shadow-xl">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-5 py-3 backdrop-blur">
            <span className="text-lg font-bold tracking-tight">
              Salapi<span className="text-blue-700">.</span>
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
              Testnet
            </span>
          </header>

          <main className="flex-1 overflow-y-auto pb-24">{children}</main>

          <BottomNav />
        </div>
      </body>
    </html>
  );
}
