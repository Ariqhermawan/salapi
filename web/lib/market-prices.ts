import type { Locale } from "@/lib/i18n/config";

/** Market quotes are presentation data, never transaction-conversion inputs. */
export const QUOTE_REFRESH_MS = 60_000;
export const QUOTE_FRESH_AGE_MS = 120_000;
export const QUOTE_MAX_AGE_MS = 300_000;
const MAX_FUTURE_SKEW_MS = 60_000;
export const MARKET_CURRENCIES = ["usd", "php", "idr", "vnd"] as const;
export type MarketCurrency = (typeof MARKET_CURRENCIES)[number];
export type AssetQuote = {
  prices: Record<MarketCurrency, number>;
  /** CoinGecko's asset timestamp, in Unix seconds. */
  updatedAt: number;
};
export type AvailableMarketPrices = {
  status: "fresh" | "stale";
  source: "CoinGecko";
  /** Fetch completion time, in Unix seconds, not the provider's price time. */
  fetchedAt: number;
  assets: { xlm: AssetQuote; usdc: AssetQuote };
};
export type MarketPriceResult = AvailableMarketPrices | {
  status: "unavailable";
  source: "CoinGecko";
  reason: "not-configured" | "provider-unavailable" | "preview";
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validTimestamp(value: unknown, nowMs: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    && value * 1000 <= nowMs + MAX_FUTURE_SKEW_MS;
}

function assetQuote(value: unknown, nowMs: number): AssetQuote | null {
  if (!record(value) || !record(value.prices) || !validTimestamp(value.updatedAt, nowMs)) return null;
  const prices = {} as Record<MarketCurrency, number>;
  for (const currency of MARKET_CURRENCIES) {
    const price = value.prices[currency];
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
    prices[currency] = price;
  }
  return { prices, updatedAt: value.updatedAt };
}

/** Recheck freshness on every use, including cached browser/server quotes. */
export function validateMarketPrices(input: unknown, nowMs = Date.now()): MarketPriceResult {
  const unavailable: MarketPriceResult = { status: "unavailable", source: "CoinGecko", reason: "provider-unavailable" };
  if (!record(input) || input.source !== "CoinGecko" || !Number.isFinite(nowMs)) return unavailable;
  if (input.status === "unavailable") {
    return { status: "unavailable", source: "CoinGecko", reason: input.reason === "not-configured" || input.reason === "preview" ? input.reason : "provider-unavailable" };
  }
  if ((input.status !== "fresh" && input.status !== "stale")
    || !validTimestamp(input.fetchedAt, nowMs) || !record(input.assets)) return unavailable;
  const xlm = assetQuote(input.assets.xlm, nowMs);
  const usdc = assetQuote(input.assets.usdc, nowMs);
  if (!xlm || !usdc) return unavailable;
  const oldestTimestamp = Math.min(xlm.updatedAt, usdc.updatedAt, input.fetchedAt);
  const age = Math.max(0, nowMs - oldestTimestamp * 1000);
  if (age > QUOTE_MAX_AGE_MS) return unavailable;
  return { status: input.status === "stale" || age > QUOTE_FRESH_AGE_MS ? "stale" : "fresh",
    source: "CoinGecko", fetchedAt: input.fetchedAt, assets: { xlm, usdc } };
}

export function marketCurrency(locale: Locale): MarketCurrency {
  return { en: "usd", tl: "php", id: "idr", vi: "vnd" }[locale] as MarketCurrency;
}

/** Display-only estimate. USDC can deviate from USD; never assume a 1:1 rate. */
export function estimateUsdc(nativeStroops: string, result: MarketPriceResult, nowMs = Date.now()): number | null {
  const checked = validateMarketPrices(result, nowMs);
  if (checked.status === "unavailable" || typeof nativeStroops !== "string"
    || !/^(?:0|[1-9]\d{0,38})$/.test(nativeStroops)) return null;
  const raw = BigInt(nativeStroops);
  // Campaign totals use the contract's nonnegative i128 range, unlike wallet i64 balances.
  if (raw.toString() !== nativeStroops || raw > 170_141_183_460_469_231_731_687_303_715_884_105_727n) return null;
  const xlm = Number(raw / 10_000_000n) + Number(raw % 10_000_000n) / 10_000_000;
  const usdc = xlm * checked.assets.xlm.prices.usd / checked.assets.usdc.prices.usd;
  if (!Number.isFinite(usdc) || (raw > 0n && usdc <= 0)) return null;
  return usdc;
}

/** A fixed USDC goal makes displayed progress follow the current market quote. */
export function marketGoalProgress(nativeStroops: string, result: MarketPriceResult, goalUsdc: number,
  nowMs = Date.now()): { usdc: number; percentage: number } | null {
  if (typeof goalUsdc !== "number" || !Number.isFinite(goalUsdc) || goalUsdc <= 0) return null;
  const usdc = estimateUsdc(nativeStroops, result, nowMs);
  if (usdc === null) return null;
  const percentage = usdc / goalUsdc * 100;
  if (!Number.isFinite(percentage)) return null;
  // Keep genuine overfunding. The rendering component can cap its visual progress bar.
  return { usdc, percentage };
}

const DISPLAY: Record<Locale, { symbol: string; intl: string; decimals: number }> = {
  en: { symbol: "$", intl: "en-US", decimals: 2 },
  tl: { symbol: "₱", intl: "en-PH", decimals: 2 },
  id: { symbol: "Rp ", intl: "id-ID", decimals: 0 },
  vi: { symbol: "₫", intl: "vi-VN", decimals: 0 },
};

/** Approximate fiat formatting only. Preserve raw stroops for every transfer. */
export function formatMarketValue(nativeStroops: string, result: MarketPriceResult, currency: Locale): string | null {
  const checked = validateMarketPrices(result);
  if (checked.status === "unavailable" || typeof nativeStroops !== "string"
    || !/^(?:0|[1-9]\d{0,18})$/.test(nativeStroops)) return null;
  const raw = BigInt(nativeStroops);
  if (raw > 9_223_372_036_854_775_807n) return null;
  const xlm = Number(raw / 10_000_000n) + Number(raw % 10_000_000n) / 10_000_000;
  const value = xlm * checked.assets.xlm.prices[marketCurrency(currency)];
  if (!Number.isFinite(value)) return null;
  const display = DISPLAY[currency];
  return display.symbol + value.toLocaleString(display.intl, {
    minimumFractionDigits: display.decimals, maximumFractionDigits: display.decimals,
  });
}
