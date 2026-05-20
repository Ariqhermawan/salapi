"use client";

// Desktop landing aside (lg: breakpoint) - the marketing column shown next
// to the phone frame on big screens at salapi-blond.vercel.app. Previously
// rendered inline in app/layout.tsx (a server component) with hardcoded
// English strings, which was the practical reason the locale switcher
// appeared broken on desktop: the most visually dominant text never moved
// when locale changed. Now a client component that consumes useT() and
// re-renders on locale change, so tapping Indonesian/Tagalog/Vietnamese
// actually flips the visible landing copy.

import { useT } from "@/components/I18nProvider";
import { Wordmark, MakerLockup, PoweredByStellar } from "@/components/ui/kit";

export default function MarketingAside() {
  const { t } = useT();
  return (
    <aside className="hidden text-white lg:flex lg:max-w-[420px] lg:flex-col lg:gap-7 lg:px-8">
      <div className="flex flex-col gap-2">
        <Wordmark size={24} c="#fff" />
        <MakerLockup c="rgba(255,255,255,0.55)" />
      </div>
      <div>
        <h1 className="text-[40px] font-semibold leading-[1.1] tracking-[-0.025em]">
          {t("landing.h1Line1")}
          <br />
          {t("landing.h1Line2")}
        </h1>
        <p className="mt-4 max-w-[380px] text-[15px] leading-relaxed text-white/70">
          {t("landing.tagline")}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl text-xl font-bold text-white"
          style={{ background: "linear-gradient(160deg,#2563EB,#0B1220)" }}
          aria-hidden
        >
          S.
        </div>
        <div className="text-xs leading-snug text-white/60">
          {t("landing.installTitle")}
          <br />
          {t("landing.installSub")}
        </div>
      </div>
      <PoweredByStellar c="rgba(255,255,255,0.5)" />
    </aside>
  );
}
