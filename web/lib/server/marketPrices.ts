import "server-only";
import { isLocalPreview } from "@/lib/local-preview";
import {
  MARKET_CURRENCIES, QUOTE_REFRESH_MS, QUOTE_MAX_AGE_MS, validateMarketPrices,
  type AvailableMarketPrices, type AssetQuote, type MarketPriceResult,
} from "@/lib/market-prices";

const REQUEST_TIMEOUT_MS = 4_000;
const MAX_RESPONSE_BYTES = 16_384;
const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=stellar%2Cusd-coin&vs_currencies=usd%2Cphp%2Cidr%2Cvnd&include_last_updated_at=true&precision=full";
let configuredKey = "";
let cached: AvailableMarketPrices | null = null;
let refreshAfter = 0;
let inFlight: Promise<MarketPriceResult> | null = null;

function unavailable(reason: "not-configured" | "provider-unavailable" | "preview"): MarketPriceResult {
  return { status: "unavailable", source: "CoinGecko", reason };
}

function providerAsset(value: unknown): AssetQuote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const prices = {} as AssetQuote["prices"];
  for (const currency of MARKET_CURRENCIES) {
    const price = raw[currency];
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
    prices[currency] = price;
  }
  if (typeof raw.last_updated_at !== "number") return null;
  return { prices, updatedAt: raw.last_updated_at };
}

function lastKnown(nowMs: number, failed = false): MarketPriceResult {
  if (!cached) return unavailable("provider-unavailable");
  return validateMarketPrices(failed ? { ...cached, status: "stale" } : cached, nowMs);
}

/** One server-only keyed request shared by concurrent callers in this instance. */
export async function getMarketPrices(): Promise<MarketPriceResult> {
  if (isLocalPreview) return unavailable("preview");
  const key = process.env.COINGECKO_DEMO_API_KEY?.trim();
  if (!key) return unavailable("not-configured");
  // A configuration change cannot keep a previous provider credential/cache.
  if (configuredKey !== key) {
    configuredKey = key; cached = null; refreshAfter = 0; inFlight = null;
  }
  const now = Date.now();
  if (inFlight) return inFlight;
  if (now < refreshAfter) return lastKnown(now);
  const task = requestPrices(key);
  inFlight = task;
  try { return await task; }
  finally { if (inFlight === task) inFlight = null; }
}

async function providerPrices(key: string, signal: AbortSignal, bypassExpiredCache = false): Promise<unknown> {
  const response = await fetch(PRICE_URL, {
    headers: { accept: "application/json", "x-cg-demo-api-key": key },
    ...(bypassExpiredCache ? { cache: "no-store" as const } : { next: { revalidate: QUOTE_REFRESH_MS / 1000 } }),
    redirect: "error", signal,
  });
  if (!response.ok || Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES || !response.body) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("Market provider is unavailable");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new Error("Quote response is too large");
      }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body) as unknown;
  } finally { reader.releaseLock(); }
}

function normalizedProviderPrices(body: unknown, nowMs: number) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid quote response");
  const raw = body as Record<string, unknown>;
  const xlm = providerAsset(raw.stellar);
  const usdc = providerAsset(raw["usd-coin"]);
  if (!xlm || !usdc) throw new Error("Missing quote");
  const timestamps = [xlm.updatedAt, usdc.updatedAt];
  const timestampsValid = timestamps.every(value => Number.isSafeInteger(value) && value > 0 && value * 1000 <= nowMs + 60_000);
  // Next may serve an expired cached HTTP200 while revalidating in the
  // background. Only a structurally valid, expired quote allows one bypass.
  const expired = timestampsValid && nowMs - Math.min(...timestamps) * 1000 > QUOTE_MAX_AGE_MS;
  const result = validateMarketPrices({ status: "fresh", source: "CoinGecko",
    fetchedAt: Math.floor(nowMs / 1000), assets: { xlm, usdc } }, nowMs);
  return { result, expired };
}

async function validatedProviderPrices(key: string, signal: AbortSignal): Promise<AvailableMarketPrices> {
  let normalized = normalizedProviderPrices(await providerPrices(key, signal), Date.now());
  if (normalized.result.status === "unavailable" && normalized.expired) {
    normalized = normalizedProviderPrices(await providerPrices(key, signal, true), Date.now());
  }
  if (normalized.result.status === "unavailable") throw new Error("Quote timestamps are unavailable");
  return normalized.result;
}

async function requestPrices(key: string): Promise<MarketPriceResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Market provider deadline exceeded"));
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    // The caller's entire read, including expired-cache recovery, is bounded.
    // Next's internal background cache revalidation has its own lifetime.
    const result = await Promise.race([validatedProviderPrices(key, controller.signal), deadline]);
    if (configuredKey === key) cached = result;
    return result;
  } catch {
    // Never expose provider bodies, credential details, or made-up prices.
    if (configuredKey !== key) return unavailable("provider-unavailable");
    const result = lastKnown(Date.now(), true);
    if (result.status !== "unavailable") cached = result;
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (configuredKey === key) refreshAfter = Date.now() + QUOTE_REFRESH_MS;
  }
}
