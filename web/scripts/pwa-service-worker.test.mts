import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const ORIGIN = "https://salapi.example";
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
type FetchEvent = {
  request: { url: string; method: string; mode: string };
  respondWith(response: Promise<Response>): void;
};
type LifecycleEvent = { waitUntil(promise: Promise<unknown>): void };

function setup(options: { offline?: boolean; status?: number; cacheFailure?: boolean } = {}) {
  let offline = options.offline ?? false;
  const stores = new Map<string, Map<string, Response>>();
  const fetches: { url: string; cache?: string }[] = [];
  const writes: { cache: string; url: string }[] = [];
  const precaches: { cache: string; urls: string[] }[] = [];
  const deleted: string[] = [];
  const lifecycle: string[] = [];
  const handlers = {} as Record<string, (event: FetchEvent & LifecycleEvent) => void>;
  const key = (value: string | { url: string }) => new URL(typeof value === "string" ? value : value.url, ORIGIN).href;
  const storeFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name)!;
  };
  runInNewContext(source, {
    URL, Response,
    self: {
      location: { origin: ORIGIN },
      addEventListener(name: string, handler: typeof handlers[string]) { handlers[name] = handler; },
      skipWaiting() { lifecycle.push("skipWaiting"); },
      clients: { claim() { lifecycle.push("claim"); } },
    },
    fetch: async (request: { url: string }, init?: { cache?: string }) => {
      fetches.push({ url: request.url, cache: init?.cache });
      if (offline) throw new Error("network unavailable");
      return new Response("fresh public response", { status: options.status ?? 200 });
    },
    caches: {
      async open(name: string) {
        if (options.cacheFailure) throw new Error("storage unavailable");
        const store = storeFor(name);
        return {
          async addAll(urls: string[]) { precaches.push({ cache: name, urls: Array.from(urls) }); },
          async put(request: { url: string }, response: Response) {
            writes.push({ cache: name, url: request.url });
            store.set(key(request), response);
          },
        };
      },
      async keys() { return Array.from(stores.keys()); },
      async delete(name: string) { deleted.push(name); return stores.delete(name); },
      async match(request: { url: string }) {
        for (const store of stores.values()) {
          const hit = store.get(key(request));
          if (hit) return hit.clone();
        }
        return undefined;
      },
    },
  });
  async function fetchEvent(path: string, requestOptions: { mode?: string; method?: string } = {}) {
    let response: Promise<Response> | undefined;
    handlers.fetch({
      request: { url: new URL(path, ORIGIN).href, method: requestOptions.method ?? "GET", mode: requestOptions.mode ?? "cors" },
      respondWith(value) { response = value; },
      waitUntil() { throw new Error("Unexpected fetch lifecycle extension"); },
    });
    return response ? await response : null;
  }
  async function runLifecycle(name: "install" | "activate") {
    let pending: Promise<unknown> | undefined;
    handlers[name]({ waitUntil(value) { pending = value; } } as FetchEvent & LifecycleEvent);
    await pending;
  }
  return {
    stores, fetches, writes, precaches, deleted, lifecycle, fetchEvent, runLifecycle,
    setOffline(value: boolean) { offline = value; },
    seed(name: string, path: string, body: string) { storeFor(name).set(key(path), new Response(body)); },
  };
}

test("v3 precaches only the three public install assets and takes over the worker", async () => {
  const sw = setup();
  await sw.runLifecycle("install");
  assert.deepEqual(sw.precaches, [{ cache: "salapi-v3", urls: ["/icon.svg", "/icon-maskable.svg", "/manifest.webmanifest"] }]);
  assert.deepEqual(sw.lifecycle, ["skipWaiting"]);
});

test("activation retires old Salapi cache versions and keeps v3", async () => {
  const sw = setup();
  sw.seed("salapi-v1", "/manifest.webmanifest", "old v1");
  sw.seed("salapi-v2", "/manifest.webmanifest", "old v2");
  sw.seed("salapi-v3", "/icon.svg", "current icon");
  await sw.runLifecycle("activate");
  assert.deepEqual(sw.deleted, ["salapi-v1", "salapi-v2"]);
  assert.deepEqual(Array.from(sw.stores.keys()), ["salapi-v3"]);
  assert.deepEqual(sw.lifecycle, ["claim"]);
});

test("a cached manifest cannot mask fresh install metadata", async () => {
  const sw = setup();
  sw.seed("salapi-v3", "/manifest.webmanifest", "older description");
  const response = await sw.fetchEvent("/manifest.webmanifest");
  assert.ok(response);
  assert.equal(await response.text(), "fresh public response");
  assert.deepEqual(sw.fetches, [{ url: ORIGIN + "/manifest.webmanifest", cache: "no-store" }]);
  assert.deepEqual(sw.writes, [{ cache: "salapi-v3", url: ORIGIN + "/manifest.webmanifest" }]);
  sw.setOffline(true);
  assert.equal(await (await sw.fetchEvent("/manifest.webmanifest"))!.text(), "fresh public response");
});

test("offline manifest fallback uses only the cached public response", async () => {
  const sw = setup({ offline: true });
  sw.seed("salapi-v3", "/manifest.webmanifest", "cached public metadata");
  assert.equal(await (await sw.fetchEvent("/manifest.webmanifest"))!.text(), "cached public metadata");
  assert.deepEqual(sw.writes, []);
});

test("a manifest without a cached fallback honestly rejects when offline", async () => {
  const sw = setup({ offline: true });
  await assert.rejects(sw.fetchEvent("/manifest.webmanifest"), /network unavailable/);
  assert.deepEqual(sw.writes, []);
});

test("server errors do not become successful cached manifests", async () => {
  const sw = setup({ status: 503 });
  sw.seed("salapi-v3", "/manifest.webmanifest", "older description");
  assert.equal((await sw.fetchEvent("/manifest.webmanifest"))!.status, 503);
  assert.deepEqual(sw.writes, []);
});

test("cache storage failure does not hide a fresh manifest", async () => {
  const sw = setup({ cacheFailure: true });
  assert.equal(await (await sw.fetchEvent("/manifest.webmanifest"))!.text(), "fresh public response");
});

test("auth, sign-in, non-GET, account fetch and RSC requests are not intercepted", async () => {
  const sw = setup();
  for (const path of ["/auth/callback", "/auth/other", "/signin"]) {
    assert.equal(await sw.fetchEvent(path, { mode: "navigate" }), null);
  }
  assert.equal(await sw.fetchEvent("/send", { method: "POST", mode: "navigate" }), null);
  for (const path of ["/settings", "/activity", "/settings?_rsc=example", "/api/private-account"]) {
    assert.equal(await sw.fetchEvent(path), null);
  }
  assert.deepEqual(sw.fetches, []);
  assert.deepEqual(sw.writes, []);
});

test("account and activity navigations are network-only, never cached", async () => {
  const sw = setup();
  for (const path of ["/settings", "/activity", "/send", "/circles/supported"]) {
    assert.equal(await (await sw.fetchEvent(path, { mode: "navigate" }))!.text(), "fresh public response");
  }
  assert.deepEqual(sw.writes, []);
  assert.equal(sw.stores.size, 0);
});

test("offline navigation is a truthful reconnect shell, not a cached account or receipt", async () => {
  const sw = setup({ offline: true });
  const response = await sw.fetchEvent("/activity", { mode: "navigate" });
  assert.ok(response);
  const body = await response.text();
  assert.match(body, /You're offline/);
  assert.match(body, /Reconnect to use Salapi/);
  assert.doesNotMatch(body, /account|wallet|donation|balance|success|transaction hash/i);
  assert.deepEqual(sw.writes, []);
});

test("the remaining static icons retain cache-first behavior", async () => {
  const sw = setup();
  sw.seed("salapi-v3", "/icon.svg", "cached public icon");
  assert.equal(await (await sw.fetchEvent("/icon.svg"))!.text(), "cached public icon");
  assert.deepEqual(sw.fetches, []);
  assert.deepEqual(sw.writes, []);
});

test("foreign or query-bearing manifest URLs cannot enter the public manifest cache", async () => {
  const sw = setup();
  assert.equal(await sw.fetchEvent("https://other.example/manifest.webmanifest?extra=1"), null);
  assert.equal(await sw.fetchEvent("/manifest.webmanifest?extra=1"), null);
  assert.deepEqual(sw.fetches, []);
  assert.deepEqual(sw.writes, []);
});
