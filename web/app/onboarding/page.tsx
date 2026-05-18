"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { Button } from "@/components/ui";
import { FadeIn } from "@/components/ui/motion";

export default function Onboarding() {
  const { t } = useT();
  const [i, setI] = useState(0);
  const slides = [
    { title: t("home.greeting"), body: t("home.tagline") },
    { title: t("home.palTitle"), body: t("home.palDesc") },
    { title: t("home.disTitle"), body: t("home.disDesc") },
  ];
  const last = i === slides.length - 1;
  return (
    <div className="flex min-h-[70vh] flex-col px-6 py-10">
      <FadeIn key={i} className="flex flex-1 flex-col justify-center">
        <h1 className="s-h1 text-3xl">{slides[i].title}</h1>
        <p className="s-sub mt-3 text-base">{slides[i].body}</p>
      </FadeIn>
      <div className="mb-6 flex justify-center gap-1.5">
        {slides.map((_, k) => (
          <span
            key={k}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: k === i ? 22 : 6,
              background:
                k === i ? "var(--color-action)" : "var(--color-hairline)",
            }}
          />
        ))}
      </div>
      {last ? (
        <Link href="/" className="s-btn text-center">
          {t("home.start")}
        </Link>
      ) : (
        <Button onClick={() => setI(i + 1)}>{t("home.start")}</Button>
      )}
    </div>
  );
}
