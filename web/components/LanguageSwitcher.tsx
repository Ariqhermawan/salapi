"use client";

import { LOCALES, LOCALE_META } from "@/lib/i18n/config";
import { useT } from "@/components/I18nProvider";

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useT();
  return (
    <div>
      <h2 className="s-label mb-2">{t("lang.choose")}</h2>
      <ul className="space-y-2">
        {LOCALES.map((l) => {
          const m = LOCALE_META[l];
          const active = l === locale;
          return (
            <li key={l}>
              <button
                onClick={() => setLocale(l)}
                className="s-card flex w-full items-center gap-3 !p-3.5 text-left transition-colors"
                style={
                  active
                    ? {
                        borderColor: "var(--color-action)",
                        boxShadow: "0 0 0 2px rgba(37,99,235,0.15)",
                      }
                    : undefined
                }
              >
                <span className="text-2xl">{m.flag}</span>
                <span className="flex-1">
                  <span className="block font-semibold text-[var(--color-ink)]">
                    {m.native}
                  </span>
                  <span className="block text-xs text-[var(--color-slate)]">
                    {m.english}
                  </span>
                </span>
                {active && (
                  <span className="text-sm font-bold text-[var(--color-action)]">
                    ✓
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
