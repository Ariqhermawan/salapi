// Salapi, display currency. The transaction rail is USDC, but the app is
// crypto-invisible: the user only ever sees their local currency plus a small
// PLAIN-DOLLAR anchor ("≈ $10.60"), never the token name "USDC". The literal
// "USDC" + tx hash live only in the on-chain receipt / "View on Stellar" layer.
// Rates are ILLUSTRATIVE (testnet), one dollar anchor, matching the V4 brief
// example (≈ $200 · ₱11,600 · Rp 3,200,000 · ₫5,100,000).
//
// The app's existing numeric values are PHP pesos, so PHP is the anchor:
// usdc = php / PHP_PER_USDC, then local = usdc * perUsdc.

import type { Locale } from "@/lib/i18n/config";

export const PHP_PER_USDC = 58;

export type CurrencyMeta = {
  code: string;
  symbol: string; // includes trailing space where the symbol needs one
  perUsdc: number; // units of this currency per 1 USDC (illustrative)
  dp: number; // decimal places shown
  intl: string; // Intl.NumberFormat locale for grouping
};

export const CURRENCY: Record<Locale, CurrencyMeta> = {
  en: { code: "USD", symbol: "$", perUsdc: 1, dp: 2, intl: "en-US" },
  tl: { code: "PHP", symbol: "₱", perUsdc: 58, dp: 2, intl: "en-PH" },
  id: { code: "IDR", symbol: "Rp ", perUsdc: 16000, dp: 0, intl: "id-ID" },
  vi: { code: "VND", symbol: "₫", perUsdc: 25500, dp: 0, intl: "vi-VN" },
};

export function pesoToUsdc(php: number): number {
  return (php || 0) / PHP_PER_USDC;
}

// Convert an app PHP value into the active locale's display currency.
export function localAmount(php: number, locale: Locale): number {
  return pesoToUsdc(php) * CURRENCY[locale].perUsdc;
}

// Split the localized amount into the parts the Money/Peso UI renders.
export function formatParts(
  php: number,
  locale: Locale
): { symbol: string; int: string; dec: string; dp: number } {
  const m = CURRENCY[locale];
  const v = Math.abs(localAmount(php, locale));
  const s = v.toLocaleString(m.intl, {
    minimumFractionDigits: m.dp,
    maximumFractionDigits: m.dp,
  });
  if (m.dp === 0) return { symbol: m.symbol, int: s, dec: "", dp: 0 };
  // Split on the locale's decimal separator (last non-digit group).
  const match = s.match(/^(.*)[.,](\d+)$/);
  if (!match) return { symbol: m.symbol, int: s, dec: "", dp: m.dp };
  return { symbol: m.symbol, int: match[1], dec: match[2], dp: m.dp };
}

// The stable dollar-value anchor shown beside the local amount. Crypto-
// invisible: the rail is USDC (≈ US$1) but the user sees a plain "$" figure,
// never the token name. (Name kept as formatUsdc to avoid churn across call
// sites; output is the USD anchor.)
export function formatUsdc(php: number): string {
  const u = pesoToUsdc(php);
  return (
    "$" +
    u.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}
