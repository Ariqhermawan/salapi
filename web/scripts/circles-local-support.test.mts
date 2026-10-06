import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isLocale, type Locale } from "../lib/i18n/config.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import { pesoFromLocal } from "../lib/ui/currency.ts";
import { previewPledgeAllocation } from "../lib/circles/pledge-allocation.ts";
import type { Circle } from "../lib/circles/types.ts";
import type { LocalSupportRecord } from "../lib/circles/local-support.ts";

function code(path: string) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const fixtureCache = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (fixtureCache.has(path)) return fixtureCache.get(path)!;
  const output: Record<string, unknown> = {};
  fixtureCache.set(path, output);
  runInNewContext(code(path), {
    exports: output,
    require(name: string) {
      if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
      if (name === "./types") return fixture("../lib/circles/types.ts");
      throw new Error(`Unexpected fixture dependency: ${name}`);
    },
  });
  return output;
}
const catalog = fixture("../lib/circles/seed.ts") as { SEED_CIRCLES: Circle[]; COMPLETED_CIRCLES: Circle[]; getCircle(id: string): Circle | undefined };
const supportCode = code("../lib/circles/local-support.ts");
const KEY = `salapi.preview.support.v1.${PREVIEW_WALLET.address}`;
type StorageMode = "normal" | "throwRead" | "throwWrite" | "drop" | "tamper";
type API = {
  readLocalSupports(): LocalSupportRecord[];
  recordLocalSupport(input: unknown): LocalSupportRecord | null;
  unreadSupportUpdates(record: LocalSupportRecord, updates?: { id: string }[]): number;
  markCircleUpdatesSeen(circleId: string, ids: unknown): boolean;
};

// The actual library runs in a fresh VM with only real pure fixtures/helpers.
// The storage map is test-owned and all network/durable-storage boundaries throw.
function setup(options: { preview?: boolean; browser?: boolean; storageMode?: StorageMode } = {}) {
  let storageMode = options.storageMode ?? "normal";
  let nextId = 0;
  const memory = new Map<string, string>();
  const overrides = new Map<string, Circle>();
  const calls = { reads: 0, writes: 0, network: 0, durableStorage: 0 };
  const forbidden = (kind: "network" | "durableStorage") => () => { calls[kind]++; throw new Error(`Forbidden isolated ${kind} boundary`); };
  const storage = {
    getItem(key: string) { calls.reads++; if (storageMode === "throwRead") throw new Error("Isolated read failure"); return memory.get(key) ?? null; },
    setItem(key: string, value: string) {
      calls.writes++;
      if (storageMode === "throwWrite") throw new Error("Isolated write failure");
      if (storageMode === "drop") return;
      if (storageMode === "tamper") {
        const data = JSON.parse(value);
        data.supports[0].organizerLabel = "Changed during read-back";
        value = JSON.stringify(data);
      }
      memory.set(key, value);
    },
    removeItem() { throw new Error("Unexpected removal"); }, clear() { throw new Error("Unexpected clear"); },
  };
  const api = {} as API;
  runInNewContext(supportCode, {
    exports: api, sessionStorage: storage,
    ...(options.browser === false ? {} : { window: { sessionStorage: storage, fetch: forbidden("network") } }),
    localStorage: { getItem: forbidden("durableStorage"), setItem: forbidden("durableStorage") },
    fetch: forbidden("network"), XMLHttpRequest: forbidden("network"), WebSocket: forbidden("network"),
    navigator: { sendBeacon: forbidden("network") }, crypto: { randomUUID: () => `isolated-${++nextId}` },
    require(name: string) {
      if (name === "../local-preview") return { isLocalPreview: options.preview ?? true, PREVIEW_WALLET };
      if (name === "../i18n/config") return { isLocale };
      if (name === "../ui/currency") return { pesoFromLocal };
      if (name === "./seed") return { getCircle: (id: string) => overrides.get(id) ?? catalog.getCircle(id) };
      if (name === "./pledge-allocation") return { previewPledgeAllocation };
      throw new Error(`Unexpected local-support dependency: ${name}`);
    },
  });
  return {
    api, calls, memory, overrides,
    mode(value: StorageMode) { storageMode = value; },
    raw(value: unknown, key = KEY) { memory.set(key, typeof value === "string" ? value : JSON.stringify(value)); },
    record(value = "100.25", currency: Locale = "tl", circle = catalog.getCircle("ate-mei-dialysis")!) { return api.recordLocalSupport({ circle, displayValue: value, currency }); },
  };
}
function plain<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function noExternal(harness: ReturnType<typeof setup>) { assert.equal(harness.calls.network, 0); assert.equal(harness.calls.durableStorage, 0); }
function noStorage(harness: ReturnType<typeof setup>) { noExternal(harness); assert.equal(harness.calls.reads, 0); assert.equal(harness.calls.writes, 0); }
function validRecord(harness: ReturnType<typeof setup>) { const record = harness.record(); assert.ok(record); return plain(record); }
function envelope(...supports: unknown[]) { return { version: 1, supports }; }

test("non-preview and server-side calls return inert results without touching storage or network", () => {
  for (const options of [{ preview: false }, { browser: false }, { preview: false, browser: false }]) {
    const h = setup(options);
    h.raw(envelope({ privateData: "Not a real account" }));
    assert.equal(h.api.readLocalSupports().length, 0); assert.equal(h.record(), null);
    assert.equal(h.api.markCircleUpdatesSeen("ate-mei-dialysis", []), false); noStorage(h);
  }
});
test("the writer uses canonical fixture identity/config and only the preview-wallet session key", () => {
  const h = setup();
  const source = catalog.getCircle("ate-mei-dialysis")!;
  const spoof = { ...source, title: "Spoofed title", organizerId: "spoof", organizer: "Spoofed name", allowance: { percentage: 10 } };
  const saved = h.api.recordLocalSupport({ circle: spoof, displayValue: " 10.01 ", currency: "en" });
  assert.ok(saved); assert.equal(saved.circleTitle, source.title); assert.equal(saved.organizerId, source.organizerId);
  assert.equal(saved.organizerLabel, source.organizer); assert.equal(saved.organizerPct, 5); assert.equal(saved.displayValue, "10.01");
  assert.equal(saved.walletAddress, PREVIEW_WALLET.address); assert.equal(saved.totalMinor, "1001");
  assert.equal(saved.beneficiaryMinor, "951"); assert.equal(saved.organizerMinor, "50");
  assert.deepEqual([...h.memory.keys()], [KEY]); assert.equal(h.calls.writes, 1);
  assert.deepEqual(plain(h.api.readLocalSupports()), [plain(saved)]); noExternal(h);
});
test("unknown/completed causes and malformed inputs never reach storage", () => {
  const h = setup();
  for (const input of [null, {}, { circle: null, displayValue: "10", currency: "tl" },
    { circle: { id: "unknown-isolated-cause" }, displayValue: "10", currency: "tl" },
    { circle: catalog.COMPLETED_CIRCLES[0], displayValue: "10", currency: "tl" },
    { circle: catalog.SEED_CIRCLES[0], displayValue: "10", currency: "xx" },
    { circle: catalog.SEED_CIRCLES[0], displayValue: 10, currency: "tl" }]) assert.equal(h.api.recordLocalSupport(input), null);
  noStorage(h);
});
test("negative, exponent, comma, zero, excess decimals and unsafe entries are rejected before storage", () => {
  const invalid: Record<Locale, string[]> = {
    en: ["", " ", "0", "-1", "1e3", "1,000", "1.001", "NaN", "Infinity", ".01", "1.", "9".repeat(41), "90071992547410"],
    tl: ["0", "-1", "1e3", "1.005", "90071992547410"], id: ["0", "-1", "1.0", "1.1", "1e3"], vi: ["0", "-1", "1.0", "1.1", "1e3"],
  };
  for (const currency of ["en", "tl", "id", "vi"] as const) {
    const h = setup(); for (const value of invalid[currency]) assert.equal(h.record(value, currency), null, `${currency}: ${value}`); noStorage(h);
  }
});
test("exact display-unit limits accept the largest representable PHP10m equivalent and reject its next unit", () => {
  for (const [currency, maximum, next] of [
    ["tl", "10000000.00", "10000000.01"], ["en", "172413.79", "172413.80"],
    ["id", "2758620689", "2758620690"], ["vi", "4396551724", "4396551725"],
  ] as const) {
    const h = setup(); const saved = h.record(maximum, currency); assert.ok(saved, currency);
    assert.equal(saved.displayValue, maximum); const writes = h.calls.writes; const reads = h.calls.reads;
    assert.equal(h.record(next, currency), null, currency); assert.equal(h.calls.writes, writes); assert.equal(h.calls.reads, reads); noExternal(h);
  }
});
test("all configured percentages conserve exact minor units in every display currency", () => {
  const configurations = new Map(catalog.SEED_CIRCLES.map(circle => [circle.allowance?.percentage ?? 0, circle]));
  assert.deepEqual([...configurations.keys()].sort((a, b) => a - b), [0, 2, 3, 5, 7, 8, 10]);
  for (const currency of ["en", "tl", "id", "vi"] as const) for (const [percentage, circle] of configurations) {
    const h = setup();
    for (const value of currency === "en" || currency === "tl" ? ["0.01", "0.50", "10.01"] : ["1", "10", "100001"]) {
      const saved = h.record(value, currency, circle); assert.ok(saved);
      const total = BigInt(saved.totalMinor); const organizer = BigInt(saved.organizerMinor); const beneficiary = BigInt(saved.beneficiaryMinor);
      assert.equal(beneficiary + organizer, total); assert.equal(organizer, (total * BigInt(percentage) + 50n) / 100n);
      assert.equal(saved.beneficiaryPct + saved.organizerPct, 100); assert.equal(saved.organizerPct, percentage);
      assert.equal(Object.keys(saved).some(key => /platform|fee/i.test(key)), false);
    }
    noExternal(h);
  }
});
test("read errors, write errors, dropped writes and changed read-back cannot report saved records", () => {
  for (const storageMode of ["throwRead", "throwWrite", "drop", "tamper"] as const) {
    const h = setup({ storageMode }); assert.equal(h.record(), null, storageMode); noExternal(h);
    if (storageMode !== "tamper") assert.equal(h.api.readLocalSupports().length, 0);
  }
});
test("invalid JSON/envelopes and records under another wallet's key are ignored without rewriting them", () => {
  const h = setup(); const good = validRecord(h); h.memory.clear();
  h.raw(envelope(good), "salapi.preview.support.v1.other-wallet");
  assert.equal(h.api.readLocalSupports().length, 0);
  for (const raw of ["{bad JSON", "null", "[]", {}, { version: 2, supports: [good] }, { version: 1, supports: {} }, { supports: [good] }]) {
    h.raw(raw); const writes = h.calls.writes; assert.equal(h.api.readLocalSupports().length, 0); assert.equal(h.calls.writes, writes);
  }
  noExternal(h);
});
test("tampered identity, timestamps, currency, precision and inconsistent monetary fields are filtered", () => {
  const h = setup(); const good = validRecord(h);
  const patches: Partial<LocalSupportRecord>[] = [
    { version: 2 as 1 }, { id: "not-local" }, { id: "local-circle-" }, { walletAddress: "other-wallet" }, { circleId: "unknown" },
    { circleTitle: "" }, { circleTitle: "x".repeat(201) }, { organizerLabel: "" }, { organizerLabel: "x".repeat(161) },
    { organizerId: "../bad" }, { organizerId: "x".repeat(101) },
    { confirmedAt: "2026-02-30T00:00:00.000Z" }, { confirmedAt: "2026-10-06T00:00:00Z" }, { confirmedAt: "2026-10-06T00:00:00.000+00:00" },
    { currency: "xx" as Locale }, { displayValue: "-100.25" }, { displayValue: "100.251" }, { displayValue: "10000000.01" },
    { totalMinor: "10026" }, { totalMinor: "010025" }, { totalMinor: "-10025" }, { totalMinor: "9".repeat(17) },
    { beneficiaryMinor: "10025" }, { organizerMinor: "0" }, { organizerPct: 11 }, { organizerPct: 2.5 }, { beneficiaryPct: 99 },
    { unread: 1 as 0 }, { seenUpdateIds: ["../invalid"] }, { seenUpdateIds: Array(1001).fill("valid") },
  ];
  for (const patch of patches) {
    h.raw(envelope({ ...good, ...patch })); const writes = h.calls.writes;
    assert.equal(h.api.readLocalSupports().length, 0, JSON.stringify(patch)); assert.equal(h.calls.writes, writes);
  }
  h.raw(envelope(null, false, {}, { ...good, totalMinor: 10025 }, { ...good, displayValue: null }, good));
  assert.deepEqual(plain(h.api.readLocalSupports()), [good]); noExternal(h);
});
test("reader deduplicates IDs, sorts strict timestamps, drops unexpected fields and retains at most50", () => {
  const h = setup(); const good = validRecord(h);
  const records = Array.from({ length: 60 }, (_, i) => ({ ...good, id: `local-circle-row-${i}`, confirmedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), privateEmail: "Not a real email", seenUpdateIds: [good.seenUpdateIds[0], good.seenUpdateIds[0]] }));
  h.raw(envelope(records[0], ...records)); const before = h.calls.writes; const read = h.api.readLocalSupports();
  assert.equal(read.length, 50); assert.equal(new Set(read.map(record => record.id)).size, 50);
  assert.equal(read[0].id, "local-circle-row-59"); assert.equal(read[49].id, "local-circle-row-10");
  assert.ok(read.every(record => !Object.hasOwn(record, "privateEmail") && record.seenUpdateIds.length === 1));
  assert.equal(h.calls.writes, before); noExternal(h);
});
test("writer bounds the stored envelope to50 unique confirmed records", () => {
  const h = setup();
  for (let i = 0; i < 55; i++) assert.ok(h.record(String(i + 1)));
  const stored = JSON.parse(h.memory.get(KEY)!);
  assert.equal(stored.version, 1); assert.equal(stored.supports.length, 50); assert.equal(stored.supports[0].id, "local-circle-isolated-55");
  assert.equal(new Set(stored.supports.map((record: LocalSupportRecord) => record.id)).size, 50); assert.equal(h.api.readLocalSupports().length, 50); noExternal(h);
});
test("confirmation starts with all current known updates seen and unread counts new valid IDs only", () => {
  const h = setup(); const circle = catalog.getCircle("ate-mei-dialysis")!; const saved = validRecord(h);
  assert.deepEqual(saved.seenUpdateIds, [...new Set(circle.updates!.map(update => update.id))]);
  assert.equal(h.api.unreadSupportUpdates(saved, circle.updates), 0);
  assert.equal(h.api.unreadSupportUpdates(saved, [...circle.updates!, { id: "future-example-update" }, { id: "future-example-update" }, { id: "../bad" }]), 1);
  assert.equal(h.api.unreadSupportUpdates(saved), 0); noExternal(h);
});
test("mark-seen rejects unknown causes/IDs and unconfirmed causes without creating records", () => {
  const h = setup(); const source = catalog.getCircle("ate-mei-dialysis")!;
  assert.equal(h.api.markCircleUpdatesSeen(source.id, [source.updates![0].id]), false); assert.equal(h.calls.writes, 0);
  validRecord(h); const writes = h.calls.writes;
  for (const [id, ids] of [["unknown", []], [source.id, ["unknown-example-update"]], [source.id, ["../bad"]], [source.id, Array(1001).fill(source.updates![0].id)], [source.id, null]] as const) {
    assert.equal(h.api.markCircleUpdatesSeen(id, ids), false); assert.equal(h.calls.writes, writes);
  }
  assert.equal(h.api.markCircleUpdatesSeen("tino-relief", [catalog.getCircle("tino-relief")!.updates![0].id]), false);
  assert.equal(h.api.readLocalSupports().length, 1); assert.equal(h.calls.writes, writes); noExternal(h);
});
test("mark-seen updates existing matching support only, deduplicates known IDs and verifies read-back", () => {
  const h = setup(); const source = catalog.getCircle("ate-mei-dialysis")!;
  const first = validRecord(h); const second = h.record("200")!; const other = h.record("300", "tl", catalog.getCircle("tino-relief")!)!;
  const newId = "new-example-delivery";
  h.overrides.set(source.id, { ...source, updates: [...source.updates!, { ...source.updates![0], id: newId }] });
  assert.equal(h.api.unreadSupportUpdates(first, [{ id: newId }]), 1);
  assert.equal(h.api.markCircleUpdatesSeen(source.id, [newId, newId]), true);
  const read = h.api.readLocalSupports();
  for (const id of [first.id, second.id]) {
    const saved = read.find(record => record.id === id)!; assert.equal(saved.seenUpdateIds.filter(updateId => updateId === newId).length, 1);
    assert.equal(h.api.unreadSupportUpdates(saved, [{ id: newId }]), 0);
  }
  assert.equal(read.find(record => record.id === other.id)!.seenUpdateIds.includes(newId), false); noExternal(h);
});
test("mark-seen returns false if storage throws or drops the newly seen state", () => {
  for (const mode of ["throwRead", "throwWrite", "drop"] as const) {
    const h = setup(); const source = catalog.getCircle("ate-mei-dialysis")!; validRecord(h);
    const newId = "new-example-delivery";
    h.overrides.set(source.id, { ...source, updates: [...source.updates!, { ...source.updates![0], id: newId }] });
    h.mode(mode); assert.equal(h.api.markCircleUpdatesSeen(source.id, [newId]), false, mode); noExternal(h);
  }
});
