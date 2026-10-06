"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
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

// Primitive snapshots stay referentially stable, including during hydration.
// Browser preferences are an external store, not a mount-time state effect.
const SERVER_PREFERENCES = `${DEFAULT_LOCALE}:`;
function preferencesSnapshot() {
  let storedLocale: string | null = null;
  let storedCurrency: string | null = null;
  let cookieLocale: string | undefined;
  try { storedLocale = localStorage.getItem(LOCALE_COOKIE); } catch { /* Optional preference. */ }
  try { storedCurrency = localStorage.getItem(CURRENCY_PREF_KEY); } catch { /* Optional preference. */ }
  try {
    cookieLocale = document.cookie.split(";").map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1);
  } catch { /* Cookies can be unavailable independently of storage. */ }
  const locale = isLocale(storedLocale) ? storedLocale : isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
  return `${locale}:${isLocale(storedCurrency) ? storedCurrency : ""}`;
}
function subscribePreferences(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === LOCALE_COOKIE || event.key === CURRENCY_PREF_KEY) notify();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}
function serverPreferencesSnapshot() { return SERVER_PREFERENCES; }

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
  const snapshot = useSyncExternalStore(subscribePreferences, preferencesSnapshot, serverPreferencesSnapshot);
  const [storedLocale, storedCurrency] = snapshot.split(":");
  // Explicit changes remain usable for this provider even if persistence fails.
  const [localeOverride, setLocaleState] = useState<Locale | null>(null);
  const [currencyOverride, setCurrencyPrefState] = useState<Locale | null | undefined>(undefined);
  const locale = localeOverride ?? (isLocale(storedLocale) ? storedLocale : DEFAULT_LOCALE);
  const currencyPref = currencyOverride === undefined ? (isLocale(storedCurrency) ? storedCurrency : null) : currencyOverride;

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(LOCALE_COOKIE, l); } catch { /* Optional preference. */ }
    try { document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000`; } catch { /* Optional preference. */ }
  }, [setLocaleState]);

  const setCurrency = useCallback((c: Locale | null) => {
    setCurrencyPrefState(c);
    try {
      if (c) localStorage.setItem(CURRENCY_PREF_KEY, c);
      else localStorage.removeItem(CURRENCY_PREF_KEY);
    } catch {
      /* storage may be unavailable */
    }
  }, [setCurrencyPrefState]);

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
