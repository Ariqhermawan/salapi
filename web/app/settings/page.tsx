"use client";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useT } from "@/components/I18nProvider";

export default function SettingsPage() {
  const { t } = useT();
  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">{t("settings.title")}</h1>
      <div className="mt-6">
        <LanguageSwitcher />
      </div>
      <section className="mt-8">
        <h2 className="s-label">{t("settings.about")}</h2>
        <p className="s-sub mt-2">{t("settings.aboutText")}</p>
        <p className="mt-3 text-[11px] font-medium tracking-wide text-[var(--color-slate)]">
          ✦ {t("common.poweredBy")} · {t("common.testnet")}
        </p>
      </section>
    </div>
  );
}
