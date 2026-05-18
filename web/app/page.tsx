"use client";

import Link from "next/link";
import Wallet from "@/components/Wallet";
import { useT } from "@/components/I18nProvider";

export default function Home() {
  const { t } = useT();
  const actions = [
    {
      href: "/paluwagan",
      title: t("home.palTitle"),
      desc: t("home.palDesc"),
      cta: t("home.palCta"),
    },
    {
      href: "/transparency",
      title: t("home.disTitle"),
      desc: t("home.disDesc"),
      cta: t("home.disCta"),
    },
    {
      href: "/send",
      title: t("home.sendTitle"),
      desc: t("home.sendDesc"),
      cta: t("home.sendCta"),
    },
    {
      href: "/savings",
      title: t("home.savTitle"),
      desc: t("home.savDesc"),
      cta: t("home.savCta"),
    },
  ];

  return (
    <div className="pb-8">
      <div className="px-5 pt-5">
        <h1 className="s-h1">{t("home.greeting")}</h1>
        <p className="s-sub mt-1">{t("home.tagline")}</p>
      </div>

      <Wallet />

      <section className="mt-8 px-5">
        <h2 className="s-label">{t("home.start")}</h2>
        <ul className="mt-3 space-y-2.5">
          {actions.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="s-card flex items-center gap-3 !p-4 transition-colors hover:border-[var(--color-action)]"
              >
                <div className="flex-1">
                  <div className="font-semibold text-[var(--color-ink)]">
                    {a.title}
                  </div>
                  <div className="mt-0.5 text-sm text-[var(--color-slate)]">
                    {a.desc}
                  </div>
                  <div className="mt-1.5 text-xs font-bold text-[var(--color-action-deep)]">
                    {a.cta} →
                  </div>
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--color-action)" }}
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 px-5 text-[11px] leading-relaxed text-[var(--color-slate)]">
        {t("home.footnote")}
      </p>
    </div>
  );
}
