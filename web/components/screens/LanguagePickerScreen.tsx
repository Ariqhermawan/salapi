"use client";

// Language picker — opened from Kamu › Preferensi › Bahasa. One header
// (the AppBar title); the old inline LanguageSwitcher duplicated it.
// Region-code badges render identically across OSes (unlike flag emoji,
// which Windows shows as bare letters).

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n/config";
import { useT } from "@/components/I18nProvider";
import {
  T,
  Ico,
  AppBar,
  IconButton,
  PoweredByStellar,
} from "@/components/ui/kit";

const REGION: Record<Locale, string> = {
  en: "GB",
  tl: "PH",
  id: "ID",
  vi: "VN",
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
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  flex: "0 0 auto",
                  background: active ? T.actionTint : T.canvas,
                  color: active ? T.action : T.slate,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.03em",
                }}
              >
                {REGION[l]}
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
                  {m.english}
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
