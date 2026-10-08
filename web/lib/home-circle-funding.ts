import { validateMarketPrices, type MarketPriceResult } from "./market-prices.ts";

/** A fictional catalog goal, using the catalog's fixed illustrative USD anchor.
 * This is not a contract goal, exchange quote, USDC balance or payment amount. */
export function exampleGoalUsd(pesoTarget: number): number | null {
  return Number.isFinite(pesoTarget) && pesoTarget > 0 ? pesoTarget / 58 : null;
}

/** Presentation-only USD value. Testnet XLM has no monetary value. */
export function fundingUsdProgress(nativeStroops: string, result: MarketPriceResult, goalUsd: number | null,
  nowMs = Date.now()): { usd: number; percentage: number | null } | null {
  const checked = validateMarketPrices(result, nowMs);
  if (checked.status === "unavailable" || typeof nativeStroops !== "string"
    || !/^(?:0|[1-9]\d{0,38})$/.test(nativeStroops)) return null;
  const raw = BigInt(nativeStroops);
  if (raw > 170_141_183_460_469_231_731_687_303_715_884_105_727n) return null;
  const xlm = Number(raw / 10_000_000n) + Number(raw % 10_000_000n) / 10_000_000;
  const usd = xlm * checked.assets.xlm.prices.usd;
  if (!Number.isFinite(usd) || raw > 0n && usd <= 0) return null;
  const percentage = goalUsd !== null && Number.isFinite(goalUsd) && goalUsd > 0 ? usd / goalUsd * 100 : null;
  return { usd, percentage: percentage !== null && Number.isFinite(percentage) ? percentage : null };
}
