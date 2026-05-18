import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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
          {/* Mobile-first frame. Screens own their own AppBar/header per the
              Claude Design system; layout only provides the frame + global nav. */}
          <div
            className="relative mx-auto flex min-h-dvh w-full max-w-[460px] flex-col"
            style={{ background: "#F4F6FB" }}
          >
            <InstallBanner />
            <main className="flex-1 overflow-y-auto pb-[92px]">
              {children}
            </main>
            <BottomNav />
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
