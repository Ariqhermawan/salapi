import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateUsdc, marketGoalProgress, QUOTE_FRESH_AGE_MS, QUOTE_MAX_AGE_MS,
  type AvailableMarketPrices, type MarketPriceResult,
} from "../lib/market-prices.ts";

const now = 1_800_000_000_000;
function quote(xlmUsd = 0.2, usdcUsd = 1, time = now): AvailableMarketPrices {
  return { status: "fresh", source: "CoinGecko", fetchedAt: time / 1000,
    assets: {
      xlm: { prices: { usd: xlmUsd, php: 11, idr: 3200, vnd: 5200 }, updatedAt: time / 1000 },
      usdc: { prices: { usd: usdcUsd, php: 55, idr: 16000, vnd: 26000 }, updatedAt: time / 1000 },
    } };
}

test("USDC estimates use both market prices, including USDC below or above its peg", () => {
  assert.equal(estimateUsdc("1000000000", quote(), now), 20);
  assert.equal(estimateUsdc("1000000000", quote(0.2, 0.8), now), 25);
  assert.equal(estimateUsdc("1000000000", quote(0.2, 1.25), now), 16);
  assert.equal(estimateUsdc("123456789", quote(0.5, 1), now), 6.17283945);
  assert.equal(estimateUsdc("1", quote(0.5, 1), now), 0.00000005);
});

test("a fixed USDC goal follows changing XLM and USDC prices without changing native tokens", () => {
  assert.deepEqual(marketGoalProgress("1000000000", quote(0.2, 1), 40, now), { usdc: 20, percentage: 50 });
  assert.deepEqual(marketGoalProgress("1000000000", quote(0.4, 1), 40, now), { usdc: 40, percentage: 100 });
  assert.deepEqual(marketGoalProgress("1000000000", quote(0.4, 0.8), 40, now), { usdc: 50, percentage: 125 });
  assert.deepEqual(marketGoalProgress("1000000000", quote(0.1, 1.25), 40, now), { usdc: 8, percentage: 20 });
});

test("confirmed zero remains zero while invalid or unavailable quotes stay unknown", () => {
  assert.equal(estimateUsdc("0", quote(), now), 0);
  assert.deepEqual(marketGoalProgress("0", quote(), 40, now), { usdc: 0, percentage: 0 });
  for (const reason of ["not-configured", "provider-unavailable", "preview"] as const) {
    const unavailable: MarketPriceResult = { status: "unavailable", source: "CoinGecko", reason };
    assert.equal(estimateUsdc("0", unavailable, now), null);
    assert.equal(marketGoalProgress("1000000000", unavailable, 40, now), null);
  }
});

test("usable stale prices remain estimates but expire at the existing freshness boundary", () => {
  assert.equal(estimateUsdc("1000000000", quote(), now + QUOTE_FRESH_AGE_MS + 1), 20);
  assert.equal(estimateUsdc("1000000000", { ...quote(), status: "stale" }, now), 20);
  assert.equal(estimateUsdc("1000000000", quote(), now + QUOTE_MAX_AGE_MS), 20);
  assert.equal(estimateUsdc("1000000000", quote(), now + QUOTE_MAX_AGE_MS + 1), null);
  assert.equal(marketGoalProgress("1000000000", quote(), 40, now + QUOTE_MAX_AGE_MS + 1), null);
  const oldUsdc = quote();
  oldUsdc.assets.usdc.updatedAt -= 301;
  assert.equal(estimateUsdc("1000000000", oldUsdc, now), null);
});

test("only canonical nonnegative i128 stroops are accepted, including values above wallet i64", () => {
  assert.ok(estimateUsdc("9223372036854775808", quote(), now)! > 0);
  assert.equal(estimateUsdc("170141183460469231731687303715884105727", quote(1, 1), now),
    Number(170141183460469231731687303715884105727n / 10000000n)
      + Number(170141183460469231731687303715884105727n % 10000000n) / 10000000);
  for (const raw of ["170141183460469231731687303715884105728", "9".repeat(200), "-1", "01", "00",
    "+1", "1.0", "1e7", "", " 1", "1 ", "1\n", "1_000", 1, null, undefined]) {
    assert.equal(estimateUsdc(raw as string, quote(), now), null, `Invalid stroops: ${String(raw)}`);
    assert.equal(marketGoalProgress(raw as string, quote(), 40, now), null);
  }
});

test("invalid prices, timestamps and fixed goals never fabricate values or progress", () => {
  for (const price of [0, -1, Infinity, Number.NaN]) {
    assert.equal(estimateUsdc("1000000000", quote(price, 1), now), null);
    assert.equal(estimateUsdc("1000000000", quote(0.2, price), now), null);
  }
  assert.equal(estimateUsdc("1000000000", { ...quote(), fetchedAt: now / 1000 + 61 }, now), null);
  assert.equal(estimateUsdc("1000000000", quote(), Number.NaN), null);
  for (const goal of [0, -1, Infinity, Number.NaN, "40", null, undefined]) {
    assert.equal(marketGoalProgress("1000000000", quote(), goal as number, now), null);
  }
});

test("overflow and underflow return unavailable estimates rather than misleading finite output", () => {
  assert.equal(estimateUsdc("1000000000", quote(Number.MAX_VALUE, 1), now), null);
  assert.equal(estimateUsdc("1000000000", quote(1, Number.MIN_VALUE), now), null);
  assert.equal(estimateUsdc("1", quote(Number.MIN_VALUE, 1), now), null);
  assert.equal(marketGoalProgress("1000000000", quote(), Number.MIN_VALUE, now), null);
});
