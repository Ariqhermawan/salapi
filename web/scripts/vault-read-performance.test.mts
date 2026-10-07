import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET } from "../lib/local-preview.ts";
import { formatLocal } from "../lib/ui/currency.ts";
import { formatStroops } from "../lib/format-stroops.ts";

type Source = "rooms" | "campaigns" | "pool" | "legacyCircle";
type Overview = Record<Source, unknown>;
type Element = { type: string; props: Record<string, unknown> };
const sources = ["rooms", "campaigns", "pool", "legacyCircle"] as const;
const unavailable: Overview = {
  rooms: { ready: false, error: "We couldn't load your rooms." },
  campaigns: { ok: false, error: "We couldn't load your campaigns." },
  pool: { ok: false, error: "The community pool is temporarily unavailable." },
  legacyCircle: null,
};
function compile(path: string, jsx = false) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
}
function load<T>(code: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const sandboxModule = { exports: {} as T };
  runInNewContext(code, {
    module: sandboxModule, exports: sandboxModule.exports, process: { env: {} }, console, Buffer,
    fetch: () => { throw Error("No network is authorized in isolated Vaults tests"); },
    require(name: string) {
      if (!(name in dependencies)) throw Error(`Unstubbed Vaults dependency: ${name}`);
      return dependencies[name];
    }, ...globals,
  });
  return sandboxModule.exports;
}
const actionCode = compile("../app/vault-read-actions.ts");
const screenCode = compile("../components/screens/VaultsScreen.tsx", true);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function actionSetup(read: (source: Source) => Promise<unknown>, preview = false) {
  const started: Source[] = [];
  const reader = (source: Source) => async () => { started.push(source); return read(source); };
  const api = load<{ vaultOverview(): Promise<Overview> }>(actionCode, {
    "./actions": { arisanList: reader("rooms"), disasterState: reader("pool"), paluwaganState: reader("legacyCircle") },
    "./campaign-actions": { campaignState: reader("campaigns") },
    "@/lib/local-preview": { isLocalPreview: preview },
  });
  return { api, started };
}
function normalized(value: unknown) { return JSON.parse(JSON.stringify(value)); }

test("one Vaults Server Action starts all four read sources before any source resolves", async () => {
  const gates = Object.fromEntries(sources.map(source => [source, deferred<unknown>()])) as Record<Source, ReturnType<typeof deferred<unknown>>>;
  const { api, started } = actionSetup(source => gates[source].promise);
  let finished = false;
  const pending = api.vaultOverview().then(value => { finished = true; return value; });
  assert.deepEqual(started, [...sources]);
  const values = Object.fromEntries(sources.map(source => [source, { source, fixture: "preserved" }])) as Overview;
  for (const source of ["legacyCircle", "pool", "campaigns"] as const) gates[source].resolve(values[source]);
  await Promise.resolve(); await Promise.resolve();
  assert.equal(finished, false, "The overview must wait for the unresolved independent room read");
  gates.rooms.resolve(values.rooms);
  const overview = await pending;
  for (const source of sources) assert.equal(overview[source], values[source]);
});

test("a rejected read only gets its existing fallback, while other fulfilled results remain exact", async () => {
  for (const rejected of sources) {
    const values = Object.fromEntries(sources.map(source => [source, { source, fixture: "preserved" }])) as Overview;
    const { api } = actionSetup(async source => {
      if (source === rejected) throw Error("Private isolated provider diagnostic must not leave the server");
      return values[source];
    });
    const overview = await api.vaultOverview();
    for (const source of sources) {
      if (source === rejected) assert.deepEqual(normalized(overview[source]), unavailable[source]);
      else assert.equal(overview[source], values[source]);
    }
    assert.doesNotMatch(JSON.stringify(overview), /Private isolated/);
  }
});

test("fulfilled unavailable results are not silently replaced with generic transport errors", async () => {
  const values = {
    rooms: { ready: false, error: "Specific readonly room error" },
    campaigns: { ok: false, error: "Specific readonly campaign error" },
    pool: { ok: false, error: "Specific readonly pool error" },
    legacyCircle: { ready: false, error: "Specific readonly legacy error" },
  };
  const { api } = actionSetup(async source => values[source]);
  const overview = await api.vaultOverview();
  for (const source of sources) assert.equal(overview[source], values[source]);
});

test("all-source failure returns all four previous error fallbacks without throwing", async () => {
  const { api } = actionSetup(async () => { throw Error("Isolated outage"); });
  assert.deepEqual(normalized(await api.vaultOverview()), unavailable);
});

test("simultaneous Vaults requests keep per-request reader results and never reuse personal state", async () => {
  const counts = Object.fromEntries(sources.map(source => [source, 0])) as Record<Source, number>;
  const pending = Object.fromEntries(sources.map(source => [source, [deferred<unknown>(), deferred<unknown>()]])) as Record<Source, ReturnType<typeof deferred<unknown>>[]>;
  const { api } = actionSetup(source => pending[source][counts[source]++].promise);
  const first = api.vaultOverview(), second = api.vaultOverview();
  for (const source of sources) {
    assert.equal(counts[source], 2);
    pending[source][1].resolve({ source, viewer: "isolated-user-two" });
  }
  const secondValue = await second;
  assert.ok(sources.every(source => (secondValue[source] as { viewer: string }).viewer === "isolated-user-two"));
  for (const source of sources) pending[source][0].resolve({ source, viewer: "isolated-user-one" });
  const firstValue = await first;
  assert.ok(sources.every(source => (firstValue[source] as { viewer: string }).viewer === "isolated-user-one"));
});

test("local preview cannot invoke deployed readers, even if the wrapper is directly called", async () => {
  const { api, started } = actionSetup(async () => { assert.fail("Preview must not read auth or ledger services"); }, true);
  assert.deepEqual(normalized(await api.vaultOverview()), unavailable);
  assert.deepEqual(started, []);
});

test("Vaults wrapper remains a zero-input Server Action, not a public GET or shared cache", () => {
  const source = readFileSync(new URL("../app/vault-read-actions.ts", import.meta.url), "utf8");
  assert.match(source, /^"use server";/);
  assert.match(source, /export async function vaultOverview\(\)/);
  assert.match(source, /Promise\.allSettled/);
  assert.doesNotMatch(source, /unstable_cache|"use cache"|new Map|cache\(|export.*\bGET\b|getSigner|invokeAs|prepareAuthenticatedWallet/);
  assert.doesNotMatch(screenCode, /require\("@\/app\/(actions|campaign-actions)"\)/);
});

function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function screenSetup(read: () => Promise<Overview>, preview = false, storage: { saved?: string; blocked?: boolean } = {}) {
  const states: unknown[] = [], effects: (() => void)[] = [], timers: (() => void)[] = [];
  const savedPreferences: [string, string][] = [];
  let index = 0, mounted = false, calls = 0;
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const api = load<{ default(): Element }>(screenCode, {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react": {
      useState(initial: unknown) {
        const slot = index++;
        if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
        return [states[slot], (value: unknown) => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }];
      },
      useCallback: (callback: unknown) => callback,
      useEffect: (effect: () => void) => { if (!mounted) effects.push(effect); },
    },
    "next/link": { default: "Link" }, "next/image": { default: "Image" },
    "@/app/vault-read-actions": { vaultOverview: () => { calls++; return read(); } },
    "@/components/I18nProvider": { useT: () => ({ currency: "en", locale: "en" }) },
    "@/components/ui/kit": { Ico: new Proxy({}, { get: () => () => null }), T: {}, PoweredByStellar: "PoweredByStellar" },
    "@/lib/ui/currency": { formatLocal }, "@/lib/format-stroops": { formatStroops },
    "@/lib/vault-campaign-media": { vaultCampaignMedia: () => null },
    "@/lib/local-preview": { PREVIEW_CAMPAIGNS, PREVIEW_TIME, PREVIEW_WALLET, normalizePreviewCampaigns: (value: unknown) => value },
    "./arisan-preview": { readPreviewArisanRoom: () => null },
    "./VaultsRevamp.module.css": { default: new Proxy({}, { get: (_target, name) => String(name) }) },
  }, {
    process: { env: { NEXT_PUBLIC_LOCAL_PREVIEW: preview ? "1" : "0" } },
    setTimeout: (callback: () => void) => { timers.push(callback); return timers.length; }, clearTimeout() {},
    sessionStorage: {
      getItem: (key: string) => { if (storage.blocked) throw Error("Storage denied"); return key === "salapi.vaults.tab.v1" ? storage.saved ?? null : null; },
      setItem: (key: string, value: string) => { if (storage.blocked) throw Error("Storage denied"); savedPreferences.push([key, value]); },
    },
  });
  return {
    states,
    savedPreferences,
    get calls() { return calls; },
    render() { index = 0; const tree = api.default(); mounted = true; return tree; },
    mount() { effects.splice(0).forEach(effect => effect()); timers.splice(0).forEach(timer => timer()); },
  };
}
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function campaignResult() {
  return { ok: true, viewer: PREVIEW_WALLET.address, contractId: "Isolated test contract", now: String(PREVIEW_TIME), campaigns: [PREVIEW_CAMPAIGNS[0]] };
}

test("actual Vaults UI requests one overview and preserves campaign cards beside a room failure", async () => {
  const overview = { ...unavailable, campaigns: campaignResult(), pool: { ok: true, active: true } };
  const ui = screenSetup(async () => overview);
  const loading = ui.render();
  assert.ok(nodes(loading).some(node => node.props.role === "status" && node.props["aria-label"] === "Loading arisan rooms"));
  assert.ok(nodes(loading).some(node => node.props.role === "status" && node.props["aria-label"] === "Loading crowdfunding campaigns"));
  ui.mount(); await flush();
  assert.equal(ui.calls, 1); assert.equal(ui.states[0], overview.rooms); assert.equal(ui.states[1], overview.campaigns);
  assert.equal(ui.states[2], overview.pool); assert.equal(ui.states[3], null); assert.equal(ui.states[4], false);
  const tree = ui.render();
  assert.match(text(tree), /Your rooms could not be loaded/);
  assert.ok(nodes(tree).some(node => node.type === "article" && node.props["aria-labelledby"] === "vault-campaign-101"));
  assert.ok(nodes(tree).some(node => node.type === "Link" && node.props.href === "/campaigns?id=101"));
  assert.doesNotMatch(text(tree), /A shared goal starts here\./);
  assert.ok(nodes(tree).some(node => node.props.className === "communityStatus" && text(node) === "Active"));
});

test("actual Vaults UI keeps room data visible when only campaigns and pool fail", async () => {
  const overview = {
    ...unavailable,
    rooms: { ready: true, total: 1, nextCursor: null, mine: [{ id: 7, name: "Isolated room 7", status: "Open", memberCount: 1, memberTarget: 3, sharePesos: 5, potPesos: 15, cadence: "Weekly", isHost: true, isMember: true }] },
    legacyCircle: { ready: true, potPesos: 15, cycleRound: 2 },
  };
  const ui = screenSetup(async () => overview); ui.render(); ui.mount(); await flush();
  const tree = ui.render();
  assert.equal(ui.calls, 1); assert.match(text(tree), /Your campaigns could not be loaded/);
  assert.match(text(tree), /Isolated room 7/);
  assert.ok(nodes(tree).some(node => node.type === "Link" && node.props.href === "/arisan/7"));
  assert.ok(nodes(tree).some(node => node.props.className === "communityStatus" && text(node) === "Unavailable"));
  assert.match(text(tree), /Shared pool · round 2/);
});

test("overview transport failure stops loading and Retry uses one request without old source actions", async () => {
  let shouldFail = true;
  const ui = screenSetup(async () => {
    if (shouldFail) throw Error("Isolated dropped action transport");
    return { ...unavailable, campaigns: campaignResult() };
  });
  ui.render(); ui.mount(); await flush();
  assert.deepEqual(normalized(ui.states.slice(0, 4)), sources.map(source => unavailable[source]));
  assert.equal(ui.states[4], false);
  const tree = ui.render();
  const retry = nodes(tree).find(node => node.type === "button" && text(node) === "Try again")!;
  assert.ok(retry); shouldFail = false;
  (retry.props.onClick as () => void)(); await flush();
  assert.equal(ui.calls, 2); assert.equal(ui.states[4], false);
  assert.ok(nodes(ui.render()).some(node => node.props["aria-labelledby"] === "vault-campaign-101"));
});

test("actual preview Vaults keeps local fixtures and never dispatches the server overview", async () => {
  const ui = screenSetup(async () => { assert.fail("Preview must not dispatch ledger reads"); }, true);
  ui.render(); ui.mount(); await flush();
  assert.equal(ui.calls, 0); assert.equal(ui.states[4], false);
  const tree = ui.render();
  assert.ok(nodes(tree).some(node => node.type === "Link" && node.props.href === "/arisan/1"));
  assert.ok(nodes(tree).some(node => node.props["aria-labelledby"] === "vault-campaign-101"));
});

function panel(tree: Element, id: "arisan" | "crowdfund") {
  const result = nodes(tree).find(node => node.props.id === `vault-panel-${id}`)!;
  assert.ok(result); assert.equal(result.props.role, "tabpanel");
  assert.equal(result.props["aria-labelledby"], `vault-tab-${id}`);
  return result;
}
function tab(tree: Element, id: "arisan" | "crowdfund") {
  const result = nodes(tree).find(node => node.props.id === `vault-tab-${id}`)!;
  assert.ok(result); assert.equal(result.props.role, "tab");
  assert.equal(result.props["aria-controls"], `vault-panel-${id}`);
  return result;
}

test("SSR tabs cannot accept clicks before initialization, but pending ledger reads do not block switching", () => {
  const pending = deferred<Overview>();
  const ui = screenSetup(() => pending.promise, false, { saved: "crowdfund" });
  const initial = ui.render();
  assert.equal(tab(initial, "arisan").props.disabled, true);
  assert.equal(tab(initial, "crowdfund").props.disabled, true);
  ui.mount();
  const mounted = ui.render();
  assert.equal(tab(mounted, "arisan").props.disabled, false);
  assert.equal(tab(mounted, "crowdfund").props.disabled, false);
  assert.equal(tab(mounted, "crowdfund").props["aria-selected"], true);
  assert.equal(ui.states[4], true, "The ledger is still loading");
  (tab(mounted, "arisan").props.onClick as () => void)();
  assert.equal(tab(ui.render(), "arisan").props["aria-selected"], true);
  assert.equal(ui.calls, 1);
});

test("Arisan and Crowdfund keep their own cards, empty states, actions and legacy discovery", async () => {
  const ui = screenSetup(async () => ({ ...unavailable, campaigns: campaignResult() }));
  ui.render(); ui.mount(); await flush();
  const tree = ui.render(), arisan = panel(tree, "arisan"), crowdfunding = panel(tree, "crowdfund");
  assert.equal(arisan.props.hidden, false); assert.equal(crowdfunding.props.hidden, true);
  assert.equal(tab(tree, "arisan").props["aria-selected"], true);
  assert.equal(tab(tree, "arisan").props.tabIndex, 0); assert.equal(tab(tree, "crowdfund").props.tabIndex, -1);
  assert.equal(nodes(arisan).some(node => String(node.props["aria-labelledby"] ?? "").startsWith("vault-campaign-")), false);
  assert.equal(nodes(crowdfunding).some(node => String(node.props.className).includes("arisanVault")), false);
  for (const href of ["/arisan/new", "/arisan/join", "/paluwagan"]) assert.ok(nodes(arisan).some(node => node.props.href === href));
  for (const href of ["/campaigns?mode=examples", "/campaigns?create=1", "/campaigns?id=101", "/transparency", "/circles"]) assert.ok(nodes(crowdfunding).some(node => node.props.href === href));
  assert.ok(nodes(tree).some(node => node.props.href === "/savings"));
  assert.match(text(arisan), /Your rooms could not be loaded/);
  assert.doesNotMatch(text(crowdfunding), /Your rooms could not be loaded/);
  const before = JSON.stringify(ui.states.slice(0, 4));
  (tab(tree, "crowdfund").props.onClick as () => void)();
  const after = ui.render();
  assert.equal(panel(after, "arisan").props.hidden, true); assert.equal(panel(after, "crowdfund").props.hidden, false);
  assert.equal(tab(after, "crowdfund").props["aria-selected"], true);
  assert.equal(JSON.stringify(ui.states.slice(0, 4)), before); assert.equal(ui.calls, 1, "Switching must reuse the read-only overview, not issue another server request");
  assert.deepEqual(ui.savedPreferences, [["salapi.vaults.tab.v1", "crowdfund"]]);
});

test("each successful empty category gets its own empty state even when the other category has data", async () => {
  const ui = screenSetup(async () => ({ ...unavailable, rooms: { ready: true, total: 0, nextCursor: null, mine: [] }, campaigns: campaignResult() }));
  ui.render(); ui.mount(); await flush();
  const tree = ui.render();
  assert.match(text(panel(tree, "arisan")), /Your next room starts here/);
  assert.doesNotMatch(text(panel(tree, "crowdfund")), /No campaigns linked/);
});

test("tab restoration accepts only known names, and denied preference storage cannot block switching", async () => {
  for (const [saved, expected] of [["crowdfund", "crowdfund"], ["arisan", "arisan"], ["wallet-secret", "arisan"]] as const) {
    const ui = screenSetup(async () => unavailable, false, { saved });
    ui.render(); ui.mount(); await flush();
    assert.equal(tab(ui.render(), expected).props["aria-selected"], true);
  }
  const ui = screenSetup(async () => unavailable, false, { saved: "crowdfund", blocked: true });
  ui.render(); ui.mount(); await flush();
  const initial = ui.render(); assert.equal(tab(initial, "arisan").props["aria-selected"], true);
  (tab(initial, "crowdfund").props.onClick as () => void)();
  assert.equal(tab(ui.render(), "crowdfund").props["aria-selected"], true);
  assert.equal(ui.calls, 1); assert.equal(ui.savedPreferences.length, 0);
});

test("arrow and Home/End keys change the selected tab and move focus without a ledger read", async () => {
  const ui = screenSetup(async () => unavailable); ui.render(); ui.mount(); await flush();
  let prevented = 0; const focused: string[] = [];
  for (const [current, key, next] of [["arisan", "ArrowRight", "crowdfund"], ["crowdfund", "ArrowLeft", "arisan"], ["arisan", "End", "crowdfund"], ["crowdfund", "Home", "arisan"]] as const) {
    const event = { key, preventDefault: () => { prevented++; }, currentTarget: { parentElement: { querySelector: (selector: string) => ({ focus: () => focused.push(selector) }) } } };
    (tab(ui.render(), current).props.onKeyDown as (event: unknown) => void)(event);
    assert.equal(tab(ui.render(), next).props["aria-selected"], true);
    assert.equal(focused.at(-1), `#vault-tab-${next}`);
  }
  assert.equal(prevented, 4); assert.equal(ui.calls, 1);
});
