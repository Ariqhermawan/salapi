import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import {
  QUOTE_REFRESH_MS, QUOTE_MAX_AGE_MS, validateMarketPrices, formatMarketValue,
  marketCurrency, type MarketPriceResult,
} from "../lib/market-prices.ts";
import * as market from "../lib/market-prices.ts";

const baseTime = Math.floor(Date.now() / 1000) * 1000;
const fakeKey = "isolated-demo-key-not-a-credential";
function quote(time = baseTime): MarketPriceResult {
  return { status: "fresh", source: "CoinGecko", fetchedAt: time / 1000,
    assets: {
      xlm: { prices: { usd: 0.2, php: 11, idr: 3200, vnd: 5200 }, updatedAt: time / 1000 },
      usdc: { prices: { usd: 0.999, php: 55, idr: 16000, vnd: 26000 }, updatedAt: time / 1000 },
    } };
}
function providerBody(time = baseTime) {
  const q = quote(time);
  assert.notEqual(q.status, "unavailable");
  if (q.status === "unavailable") throw new Error("Fixture is invalid");
  return { stellar: { ...q.assets.xlm.prices, last_updated_at: q.assets.xlm.updatedAt },
    "usd-coin": { ...q.assets.usdc.prices, last_updated_at: q.assets.usdc.updatedAt } };
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }); }
function compile(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
type ResponseFixture = Response | Error | "hang" | "body-hang";
function service(options: { responses?: ResponseFixture[]; key?: string; preview?: boolean; immediateTimeout?: boolean; timeoutOnRecovery?: boolean } = {}) {
  let now = baseTime;
  const env: Record<string, string | undefined> = { COINGECKO_DEMO_API_KEY: options.key ?? fakeKey };
  const queue = [...options.responses ?? []];
  const calls: { url: string; options: RequestInit & { next?: { revalidate: number } } }[] = [];
  const deadlines: number[] = [];
  let cleared = 0;
  let expire: (() => void) | undefined;
  const sandboxModule = { exports: {} as { getMarketPrices(): Promise<MarketPriceResult> } };
  runInNewContext(compile("../lib/server/marketPrices.ts"), {
    module: sandboxModule, exports: sandboxModule.exports, process: { env }, AbortController, TextDecoder,
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback: () => void, delay: number) => {
      deadlines.push(delay);
      expire = callback;
      if (options.immediateTimeout) { queueMicrotask(callback); return 1; }
      return setTimeout(callback, delay);
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => { cleared++; clearTimeout(timer); },
    fetch: async (url: string, fetchOptions: RequestInit & { next?: { revalidate: number } }) => {
      calls.push({ url, options: fetchOptions });
      if (options.timeoutOnRecovery && calls.length === 2) queueMicrotask(() => expire?.());
      assert.equal(new URL(url).origin, "https://api.coingecko.com");
      assert.equal(fetchOptions.redirect, "error");
      if (fetchOptions.cache === "no-store") assert.equal(fetchOptions.next, undefined);
      else { assert.equal(fetchOptions.cache, undefined); assert.equal(fetchOptions.next?.revalidate, 60); }
      assert.ok(fetchOptions.signal);
      assert.ok(queue.length, "No undeclared provider request may run");
      const item = queue.shift()!;
      if (item instanceof Error) throw item;
      if (item === "hang") return new Promise<Response>(() => {});
      if (item === "body-hang") return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          const fail = () => controller.error(new Error("Isolated aborted body"));
          if (fetchOptions.signal!.aborted) fail();
          else fetchOptions.signal!.addEventListener("abort", fail, { once: true });
        },
      }));
      return item;
    },
    require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "@/lib/local-preview") return { isLocalPreview: options.preview ?? false };
      if (name === "@/lib/market-prices") return { ...market,
        validateMarketPrices: (value: unknown, current = now) => validateMarketPrices(value, current) };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { api: sandboxModule.exports, calls, env, deadlines, get cleared() { return cleared; },
    advance(ms: number) { now += ms; }, setTime(value: number) { now = value; } };
}

test("quote parser copies only public fields and keeps exact CoinGecko USDC price", () => {
  const result = validateMarketPrices({ ...quote(), credential: fakeKey }, baseTime);
  assert.equal(result.status, "fresh");
  assert.ok(!JSON.stringify(result).includes(fakeKey));
  assert.equal(result.assets.usdc.prices.usd, 0.999);
  assert.deepEqual(["en", "tl", "id", "vi"].map(value => marketCurrency(value as "en")), ["usd", "php", "idr", "vnd"]);
});

test("quote freshness follows asset timestamps, preserves failure stale state and expires", () => {
  assert.equal(validateMarketPrices(quote(), baseTime + 120_000).status, "fresh");
  assert.equal(validateMarketPrices(quote(), baseTime + 120_001).status, "stale");
  assert.equal(validateMarketPrices(quote(), baseTime + QUOTE_MAX_AGE_MS).status, "stale");
  assert.equal(validateMarketPrices(quote(), baseTime + QUOTE_MAX_AGE_MS + 1).status, "unavailable");
  assert.equal(validateMarketPrices({ ...quote(), status: "stale" }, baseTime).status, "stale");
  const old = quote();
  if (old.status === "unavailable") throw new Error("Bad fixture");
  old.assets.usdc.updatedAt -= 301;
  assert.equal(validateMarketPrices(old, baseTime).status, "unavailable");
});

test("missing, zero, malformed, negative and future market prices never become a fabricated quote", () => {
  for (const input of [null, [], {}, { ...quote(), source: "Other provider" },
    { ...quote(), fetchedAt: Number.NaN }, { ...quote(), fetchedAt: baseTime / 1000 + 61 }]) {
    assert.equal(validateMarketPrices(input, baseTime).status, "unavailable");
  }
  for (const price of [0, -1, Infinity, Number.NaN, "0.2", null, undefined]) {
    const value = quote();
    if (value.status === "unavailable") throw new Error("Bad fixture");
    (value.assets.xlm.prices as Record<string, unknown>).usd = price;
    assert.equal(validateMarketPrices(value, baseTime).status, "unavailable");
  }
  for (const timestamp of [0, -1, 1.5, baseTime / 1000 + 61]) {
    const value = quote();
    if (value.status === "unavailable") throw new Error("Bad fixture");
    value.assets.xlm.updatedAt = timestamp;
    assert.equal(validateMarketPrices(value, baseTime).status, "unavailable");
  }
});

test("native stroops valuation is display-only, respects true zero and rejects invalid signed/decimal amounts", () => {
  assert.equal(formatMarketValue("1000000000", quote(), "en"), "$20.00");
  assert.equal(formatMarketValue("1000000000", quote(), "tl"), "₱1,100.00");
  assert.equal(formatMarketValue("1000000000", quote(), "id"), "Rp 320.000");
  assert.equal(formatMarketValue("0", quote(), "en"), "$0.00");
  for (const input of ["-1", "01", "1.1", "1e7", "", "9223372036854775808", "9".repeat(200)]) {
    assert.equal(formatMarketValue(input, quote(), "en"), null);
  }
  assert.equal(formatMarketValue("10000000", { status: "unavailable", source: "CoinGecko", reason: "not-configured" }, "en"), null);
});

test("required server key and preview guards prevent all external requests", async () => {
  for (const options of [{ key: "" }, { key: "   " }, { preview: true }]) {
    const fixture = service(options);
    const result = await fixture.api.getMarketPrices();
    assert.equal(result.status, "unavailable");
    if (result.status === "unavailable") assert.equal(result.reason, options.preview ? "preview" : "not-configured");
    assert.equal(fixture.calls.length, 0); assert.equal(fixture.deadlines.length, 0);
  }
});

test("one fixed-host request sends key only in server header and filters untrusted provider extras", async () => {
  const fixture = service({ responses: [json({ ...providerBody(), privateDiagnostics: fakeKey })] });
  const result = await fixture.api.getMarketPrices();
  assert.equal(result.status, "fresh"); assert.equal(fixture.calls.length, 1);
  const call = fixture.calls[0];
  const url = new URL(call.url);
  assert.equal(url.pathname, "/api/v3/simple/price");
  assert.equal(url.searchParams.get("ids"), "stellar,usd-coin");
  assert.equal(url.searchParams.get("vs_currencies"), "usd,php,idr,vnd");
  assert.equal(url.searchParams.get("include_last_updated_at"), "true");
  assert.equal((call.options.headers as Record<string, string>)["x-cg-demo-api-key"], fakeKey);
  assert.ok(!call.url.includes(fakeKey)); assert.ok(!JSON.stringify(result).includes(fakeKey));
  assert.deepEqual(fixture.deadlines, [4000]); assert.equal(fixture.cleared, 1);
});

test("concurrent requests and repeated manual refreshes deduplicate then refresh after60s", async () => {
  const fixture = service({ responses: [json(providerBody()), json(providerBody(baseTime + 60_000))] });
  const results = await Promise.all(Array.from({ length: 15 }, () => fixture.api.getMarketPrices()));
  assert.ok(results.every(result => result.status === "fresh")); assert.equal(fixture.calls.length, 1);
  await fixture.api.getMarketPrices(); fixture.advance(59_999); await fixture.api.getMarketPrices();
  assert.equal(fixture.calls.length, 1);
  fixture.advance(1); assert.equal((await fixture.api.getMarketPrices()).status, "fresh");
  assert.equal(fixture.calls.length, 2); assert.equal(QUOTE_REFRESH_MS, 60_000);
});

test("provider statuses, network errors, malformed/oversized bodies fail neutral and back off", async () => {
  for (const item of [json({}, 401), json({}, 404), json({}, 429), json({}, 503), new Error(fakeKey),
    new Response("invalid-json"), json({ stellar: providerBody().stellar }),
    new Response(" ".repeat(16_385)), new Response("{}", { headers: { "content-length": "200000" } })]) {
    const fixture = service({ responses: [item] });
    const result = await fixture.api.getMarketPrices();
    assert.equal(result.status, "unavailable"); assert.ok(!JSON.stringify(result).includes(fakeKey));
    await fixture.api.getMarketPrices(); assert.equal(fixture.calls.length, 1);
  }
});

test("an expired successful Next cache body recovers with one bounded no-store request, shared by callers", async () => {
  const fixture = service({ responses: [json(providerBody(baseTime - QUOTE_MAX_AGE_MS - 1000)), json(providerBody())] });
  const results = await Promise.all(Array.from({ length: 12 }, () => fixture.api.getMarketPrices()));
  assert.ok(results.every(result => result.status === "fresh"));
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].options.next?.revalidate, 60);
  assert.equal(fixture.calls[1].options.cache, "no-store");
  assert.equal(fixture.calls[1].options.next, undefined);
  assert.equal(fixture.calls[0].options.signal, fixture.calls[1].options.signal);
  assert.deepEqual(fixture.deadlines, [4000]);
  await fixture.api.getMarketPrices(); assert.equal(fixture.calls.length, 2);
});

test("expired cache bypass happens at most once and never turns expired or failed provider results into a price", async () => {
  for (const recovery of [json(providerBody(baseTime - QUOTE_MAX_AGE_MS - 1000)), json({}, 429), new Error(fakeKey)]) {
    const fixture = service({ responses: [json(providerBody(baseTime - QUOTE_MAX_AGE_MS - 1000)), recovery] });
    assert.equal((await fixture.api.getMarketPrices()).status, "unavailable");
    assert.equal(fixture.calls.length, 2); assert.deepEqual(fixture.deadlines, [4000]);
    await fixture.api.getMarketPrices(); assert.equal(fixture.calls.length, 2);
  }
});

test("expired-cache recovery cannot reset the original deadline for stalled headers or body", async () => {
  for (const response of ["hang", "body-hang"] as const) {
    const fixture = service({ responses: [json(providerBody(baseTime - QUOTE_MAX_AGE_MS - 1000)), response], timeoutOnRecovery: true });
    assert.equal((await fixture.api.getMarketPrices()).status, "unavailable");
    assert.equal(fixture.calls.length, 2); assert.deepEqual(fixture.deadlines, [4000]);
    assert.equal(fixture.calls[0].options.signal, fixture.calls[1].options.signal);
    assert.equal(fixture.calls[1].options.signal!.aborted, true); assert.equal(fixture.cleared, 1);
  }
});

test("malformed or future timestamps do not authorize expired-cache bypass", async () => {
  for (const timestamp of [0, -1, 1.5, baseTime / 1000 + 61]) {
    const body = providerBody(baseTime - QUOTE_MAX_AGE_MS - 1000);
    body.stellar.last_updated_at = timestamp;
    const fixture = service({ responses: [json(body)] });
    assert.equal((await fixture.api.getMarketPrices()).status, "unavailable");
    assert.equal(fixture.calls.length, 1);
  }
});

test("a valid stale but usable cache quote stays labelled stale without forced provider calls", async () => {
  const fixture = service({ responses: [json(providerBody(baseTime - 200_000))] });
  assert.equal((await fixture.api.getMarketPrices()).status, "stale");
  assert.equal(fixture.calls.length, 1);
});

test("last verified price remains explicitly stale after failed refresh, then expires without fabricated fallback", async () => {
  const fixture = service({ responses: [json(providerBody()), json({}, 429), json({}, 503)] });
  assert.equal((await fixture.api.getMarketPrices()).status, "fresh");
  fixture.advance(60_000); assert.equal((await fixture.api.getMarketPrices()).status, "stale");
  fixture.advance(10_000); assert.equal((await fixture.api.getMarketPrices()).status, "stale");
  assert.equal(fixture.calls.length, 2);
  fixture.advance(QUOTE_MAX_AGE_MS); assert.equal((await fixture.api.getMarketPrices()).status, "unavailable");
  assert.equal(fixture.calls.length, 3);
});

test("both stalled headers and body are bounded by the same4s deadline", async () => {
  for (const response of ["hang", "body-hang"] as const) {
    const fixture = service({ responses: [response], immediateTimeout: true });
    const result = await fixture.api.getMarketPrices();
    assert.equal(result.status, "unavailable"); assert.deepEqual(fixture.deadlines, [4000]);
    assert.equal(fixture.cleared, 1); assert.equal(fixture.calls[0].options.signal!.aborted, true);
  }
});

test("price route returns only safe quote JSON with browser cache disabled and exposesGET only", async () => {
  const code = compile("../app/api/market-prices/route.ts");
  const sandboxModule = { exports: {} as { GET(): Promise<Response> } };
  runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, Response,
    require: (name: string) => {
      assert.equal(name, "@/lib/server/marketPrices");
      return { getMarketPrices: async () => ({ status: "unavailable", source: "CoinGecko", reason: "not-configured" }) };
    } });
  const response = await sandboxModule.exports.GET();
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Object.keys(sandboxModule.exports), ["GET"]);
  assert.deepEqual(await response.json(), { status: "unavailable", source: "CoinGecko", reason: "not-configured" });
});
