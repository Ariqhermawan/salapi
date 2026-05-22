"use client";

// Language picker — opened from Kamu › Preferensi › Bahasa. One header
// (the AppBar title). Each row shows the country flag and the display
// currency that language carries (the currency follows the language).

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { CURRENCY } from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  PoweredByStellar,
} from "@/components/ui/kit";
import { Flag, type FlagCode } from "@/components/ui/flags";

const FLAG: Record<Locale, FlagCode> = {
  en: "gb",
  tl: "ph",
  id: "id",
  vi: "vn",
};

export default function LanguagePickerScreen() {
  const { locale, setLocale, t } = useT();
  const router = useRouter();

  return (
    <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%" }}>
      <AppBar
        leading={
          <IconButton onClick={() => router.push("/settings")}>
            {Ico.back({})}
          </IconButton>
        }
        title={t("lang.choose")}
      />

      <div
        style={{
          padding: "8px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {LOCALES.map((l) => {
          const m = LOCALE_META[l];
          const active = l === locale;
          return (
            <button
              key={l}
              onClick={() => setLocale(l)}
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
                padding: "14px 16px",
                fontFamily: T.fontSans,
                boxShadow: active
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
                  flex: "0 0 auto",
                  borderRadius: 5,
                  overflow: "hidden",
                  boxShadow: "0 0 0 1px rgba(11,18,32,0.12)",
                  lineHeight: 0,
                }}
              >
                <Flag code={FLAG[l]} w={34} />
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
                  {m.native}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 12.5,
                    color: T.slate,
                    marginTop: 1,
                  }}
                >
                  {m.english} · {CURRENCY[l].code}
                </span>
              </span>
              {active && Ico.check({ size: 20, c: T.action })}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "20px 16px 0", textAlign: "center" }}>
        <PoweredByStellar />
      </div>
    </div>
  );
}
