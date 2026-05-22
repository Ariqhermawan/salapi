"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";
import { DICTS } from "@/lib/i18n/dictionaries";

// Display-currency preference, stored apart from the language. null means
// "follow the language" — the default the app shipped with.
const CURRENCY_PREF_KEY = "salapi_currency";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  // Resolved display currency (currencyPref ?? locale) and its controls.
  currency: Locale;
  currencyPref: Locale | null;
  setCurrency: (c: Locale | null) => void;
};

const I18nContext = createContext<Ctx | null>(null);

function resolve(obj: unknown, path: string): string | undefined {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, k) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[k]
          : undefined,
      obj
    ) as string | undefined;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [currencyPref, setCurrencyPrefState] = useState<Locale | null>(null);

  useEffect(() => {
    const fromLs =
      typeof window !== "undefined" ? localStorage.getItem(LOCALE_COOKIE) : null;
    const fromCookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith(LOCALE_COOKIE + "="))
      ?.split("=")[1];
    const initial = fromLs ?? fromCookie;
    if (isLocale(initial) && initial !== locale) setLocaleState(initial);
    const cur =
      typeof window !== "undefined"
        ? localStorage.getItem(CURRENCY_PREF_KEY)
        : null;
    if (isLocale(cur)) setCurrencyPrefState(cur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_COOKIE, l);
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000`;
      document.documentElement.lang = l;
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const setCurrency = useCallback((c: Locale | null) => {
    setCurrencyPrefState(c);
    try {
      if (c) localStorage.setItem(CURRENCY_PREF_KEY, c);
      else localStorage.removeItem(CURRENCY_PREF_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const raw =
        resolve(DICTS[locale], key) ?? resolve(DICTS.en, key) ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, k) =>
        k in vars ? String(vars[k]) : `{${k}}`
      );
    },
    [locale]
  );

  // Display currency: an explicit pick, otherwise it follows the language.
  const currency: Locale = currencyPref ?? locale;

  const value = useMemo(
    () => ({ locale, setLocale, t, currency, currencyPref, setCurrency }),
    [locale, setLocale, t, currency, currencyPref, setCurrency]
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx;
}
