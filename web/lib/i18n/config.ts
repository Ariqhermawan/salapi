export const LOCALES = ["en", "tl", "id", "vi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "salapi_locale";

export const LOCALE_META: Record<
  Locale,
  { native: string; english: string; flag: string }
> = {
  en: { native: "English", english: "English", flag: "🇬🇧" },
  tl: { native: "Tagalog", english: "Filipino", flag: "🇵🇭" },
  id: { native: "Bahasa Indonesia", english: "Indonesian", flag: "🇮🇩" },
  vi: { native: "Tiếng Việt", english: "Vietnamese", flag: "🇻🇳" },
};

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}
