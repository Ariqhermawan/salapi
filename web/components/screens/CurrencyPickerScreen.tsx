"use client";

// Display-currency picker — opened from Kamu › Preferensi › Mata uang
// tampilan. "Otomatis" follows the chosen language (the default); a
// specific pick overrides it. The choice drives every amount the
// currency-aware Money component renders across the app.

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { CURRENCY, CURRENCY_LABEL } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  PoweredByStellar,
} from "@/components/ui/kit";

type Opt = {
  key: Locale | null;
  title: string;
  sub: string;
  badge: React.ReactNode;
  active: boolean;
};

export default function CurrencyPickerScreen() {
  const { t, locale, currencyPref, setCurrency } = useT();
  const router = useRouter();

  const opts: Opt[] = [
    {
      key: null,
      title: t("settings.currencyAuto"),
      sub: t("settings.currencySub") + " · " + CURRENCY[locale].code,
      badge: Ico.globe({
        size: 20,
        c: currencyPref === null ? T.action : T.slate,
      }),
      active: currencyPref === null,
    },
    ...LOCALES.map(
      (l): Opt => ({
        key: l,
        title: CURRENCY_LABEL[l],
        sub: LOCALE_META[l].native,
        badge: (
          <span style={{ fontSize: 15, fontWeight: 700 }}>
            {CURRENCY[l].symbol.trim()}
          </span>
        ),
        active: currencyPref === l,
      })
    ),
  ];

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%" }}>
      <AppBar
        leading={
          <IconButton onClick={() => router.push("/settings")}>
            {Ico.back({})}
          </IconButton>
        }
        title={t("settings.currency")}
      />

      <div
        style={{
          padding: "8px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {opts.map((o) => (
          <button
            key={String(o.key)}
            onClick={() => setCurrency(o.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              width: "100%",
              textAlign: "left",
              cursor: "pointer",
              border: "none",
              background: T.surface,
              borderRadius: 16,
              padding: "13px 16px",
              fontFamily: T.fontSans,
              boxShadow: o.active
                ? "inset 0 0 0 1.5px " +
                  T.action +
                  ", 0 8px 20px -12px rgba(37,99,235,0.55)"
                : "inset 0 0 0 1px " + T.hairline,
              transition: "box-shadow .14s ease",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                flex: "0 0 auto",
                background: o.active ? T.actionTint : T.canvas,
                color: o.active ? T.action : T.slate,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {o.badge}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: "block",
                  fontSize: 16,
                  fontWeight: 600,
                  color: T.ink,
                }}
              >
                {o.title}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: 12.5,
                  color: T.slate,
                  marginTop: 1,
                }}
              >
                {o.sub}
              </span>
            </span>
            {o.active && Ico.check({ size: 20, c: T.action })}
          </button>
        ))}
      </div>

      <div
        style={{
          padding: "16px 20px 0",
          textAlign: "center",
          fontSize: 12,
          color: T.slate,
          lineHeight: 1.5,
        }}
      >
        {t("settings.currencyNote")}
      </div>
      <div style={{ padding: "14px 16px 0", textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
