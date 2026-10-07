import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as reminderApi from "../lib/arisan-funding-reminders.ts";
import { arisanFundingReminderKey, buildArisanFundingCalendar, escapeFundingCalendarText, foldFundingCalendarLine, formatFundingDeadlineUtc, formatFundingReminderXlm, fundingReminderPhase, readArisanFundingReminder, saveArisanFundingReminder, type ArisanFundingReminderScope, type FundingReminderStorage } from "../lib/arisan-funding-reminders.ts";

const scope: ArisanFundingReminderScope = { contractId: "C" + "A".repeat(55), roomId: 9, viewer: "G" + "B".repeat(55) };
const now = 1_791_400_000;
const deadline = now + 172_800;
const options = { now, deadline, remainingStroops: "15000000", status: "Open" as const };

function memory(mode?: "get" | "set" | "drop" | "remove") {
  const data = new Map<string, string>();
  const storage: FundingReminderStorage = {
    getItem(key) { if (mode === "get") throw new Error("Read denied"); return data.get(key) ?? null; },
    setItem(key, value) { if (mode === "set") throw new Error("Write denied"); if (mode !== "drop") data.set(key, value); },
    removeItem(key) { if (mode === "remove") throw new Error("Removal denied"); data.delete(key); },
  };
  return { data, storage };
}

test("reminder is off by default and only a verified write enables it", () => {
  const { data, storage } = memory();
  assert.deepEqual(readArisanFundingReminder(storage, scope), { ok: true, enabled: false });
  assert.equal(saveArisanFundingReminder(storage, scope, true), true);
  assert.deepEqual(readArisanFundingReminder(storage, scope), { ok: true, enabled: true });
  assert.deepEqual(JSON.parse(data.get(arisanFundingReminderKey(scope)!)!), { version: 1, enabled: true });
  assert.equal(saveArisanFundingReminder(storage, scope, false), true);
  assert.equal(data.size, 0);
  assert.deepEqual(readArisanFundingReminder(storage, scope), { ok: true, enabled: false });
});

test("contract, room, and wallet each isolate opt-in and opt-out", () => {
  const { data, storage } = memory();
  const scopes = [scope, { ...scope, contractId: "C" + "B".repeat(55) }, { ...scope, roomId: 10 }, { ...scope, viewer: "G" + "C".repeat(55) }];
  assert.equal(new Set(scopes.map(arisanFundingReminderKey)).size, 4);
  assert.equal(saveArisanFundingReminder(storage, scope, true), true);
  for (const other of scopes.slice(1)) assert.deepEqual(readArisanFundingReminder(storage, other), { ok: true, enabled: false });
  for (const other of scopes.slice(1)) assert.equal(saveArisanFundingReminder(storage, other, true), true);
  assert.equal(saveArisanFundingReminder(storage, scope, false), true);
  assert.equal(data.size, 3);
  for (const other of scopes.slice(1)) assert.deepEqual(readArisanFundingReminder(storage, other), { ok: true, enabled: true });
});

for (const malformed of [
  { ...scope, contractId: "../contract" }, { ...scope, viewer: "guest" }, { ...scope, roomId: 0 }, { ...scope, roomId: -1 },
  { ...scope, roomId: 1.5 }, { ...scope, roomId: Number.MAX_SAFE_INTEGER + 1 },
  { ...scope, contractId: "C" + "A".repeat(54) }, { ...scope, viewer: "G" + "1".repeat(55) },
]) test(`invalid reminder scope cannot read, write, or export: ${JSON.stringify(malformed)}`, () => {
  const { storage, data } = memory();
  assert.equal(arisanFundingReminderKey(malformed), null);
  assert.deepEqual(readArisanFundingReminder(storage, malformed), { ok: false, reason: "invalid_scope" });
  assert.equal(saveArisanFundingReminder(storage, malformed, true), false);
  assert.equal(buildArisanFundingCalendar(malformed, options), null);
  assert.equal(data.size, 0);
});

test("unavailable storage cannot be described as enabled or saved", () => {
  assert.deepEqual(readArisanFundingReminder(null, scope), { ok: false, reason: "storage_unavailable" });
  assert.equal(saveArisanFundingReminder(null, scope, true), false);
  assert.equal(saveArisanFundingReminder(null, scope, false), false);
  const denied = memory("get");
  assert.deepEqual(readArisanFundingReminder(denied.storage, scope), { ok: false, reason: "storage_unavailable" });
  assert.equal(saveArisanFundingReminder(denied.storage, scope, true), false);
});

test("denied and silently dropped writes never return saved-success", () => {
  for (const mode of ["set", "drop"] as const) {
    const { storage, data } = memory(mode);
    assert.equal(saveArisanFundingReminder(storage, scope, true), false);
    assert.equal(data.size, 0);
  }
});

test("failed opt-out leaves its existing confirmed preference without claiming success", () => {
  const { storage, data } = memory("remove");
  data.set(arisanFundingReminderKey(scope)!, JSON.stringify({ version: 1, enabled: true }));
  assert.equal(saveArisanFundingReminder(storage, scope, false), false);
  assert.deepEqual(readArisanFundingReminder(storage, scope), { ok: true, enabled: true });
});

test("malformed, obsolete, and expanded preference payloads never enable reminders", () => {
  const { storage, data } = memory();
  for (const raw of ["not json", "null", "[]", "true", '{"version":2,"enabled":true}', '{"enabled":true}', '{"version":1,"enabled":"true"}', '{"version":1,"enabled":false}', '{"version":1,"enabled":true,"email":"hidden@example.com"}']) {
    data.set(arisanFundingReminderKey(scope)!, raw);
    const loaded = readArisanFundingReminder(storage, scope);
    assert.equal(loaded.ok, false, raw);
  }
});

test("fully funded or closed rooms automatically suppress reminders", () => {
  assert.equal(fundingReminderPhase("Open", "0", deadline, now), "suppressed");
  for (const status of ["Active", "Done", "Dissolved"] as const) {
    assert.equal(fundingReminderPhase(status, "15000000", deadline, now), "suppressed");
    assert.equal(buildArisanFundingCalendar(scope, { ...options, status }), null);
  }
  assert.equal(buildArisanFundingCalendar(scope, { ...options, remainingStroops: "0" }), null);
});

test("deadline equality is already overdue, never a payable reminder", () => {
  assert.equal(fundingReminderPhase("Open", options.remainingStroops, deadline, deadline - 1), "pending");
  assert.equal(fundingReminderPhase("Open", options.remainingStroops, deadline, deadline), "overdue");
  assert.equal(fundingReminderPhase("Open", options.remainingStroops, deadline, deadline + 1), "overdue");
  assert.equal(buildArisanFundingCalendar(scope, { ...options, now: deadline }), null);
  assert.equal(buildArisanFundingCalendar(scope, { ...options, now: deadline - 1 }), null);
});

test("invalid money or deadline cannot manufacture reminder state", () => {
  for (const remainingStroops of ["-1", "01", "+1", "1.5", "1e7", "", "1" + "0".repeat(39), (1n << 127n).toString()]) {
    assert.equal(fundingReminderPhase("Open", remainingStroops, deadline, now), "invalid");
    assert.equal(formatFundingReminderXlm(remainingStroops), null);
    assert.equal(buildArisanFundingCalendar(scope, { ...options, remainingStroops }), null);
  }
  for (const invalidTime of [0, -1, 1.2, NaN, Infinity, 253_402_300_800]) {
    assert.equal(formatFundingDeadlineUtc(invalidTime), null);
    assert.equal(fundingReminderPhase("Open", options.remainingStroops, invalidTime, now), "invalid");
    assert.equal(fundingReminderPhase("Open", options.remainingStroops, deadline, invalidTime), "invalid");
  }
});

test("Testnet XLM display remains exact down to one stroop without Number rounding", () => {
  assert.equal(formatFundingReminderXlm("0"), "0");
  assert.equal(formatFundingReminderXlm("1"), "0.0000001");
  assert.equal(formatFundingReminderXlm("15000000"), "1.5");
  assert.equal(formatFundingReminderXlm("123456789123456789"), "12345678912.3456789");
  assert.equal(formatFundingReminderXlm(((1n << 127n) - 1n).toString()), "17014118346046923173168730371588.4105727");
});

test("calendar TEXT escapes newlines, separators, backslashes, and strips unsafe controls", () => {
  assert.equal(escapeFundingCalendarText("hello, world; path\\x\r\nBEGIN:VEVENT\nmore\rtext\u0000\u0007"), "hello\\, world\\; path\\\\x\\nBEGIN:VEVENT\\nmore\\ntext");
});

test("calendar folding stays within 75 UTF-8 bytes and preserves multi-byte text", () => {
  const original = "DESCRIPTION:" + "Indonesian 🇮🇩, Vietnamese Việt Nam, 😀. ".repeat(12);
  const folded = foldFundingCalendarLine(escapeFundingCalendarText(original));
  const physicalLines = folded.split("\r\n");
  assert.ok(physicalLines.length > 1);
  for (const line of physicalLines) assert.ok(Buffer.byteLength(line, "utf8") <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), escapeFundingCalendarText(original));
  assert.doesNotMatch(folded, /\uFFFD/);
});

test("calendar exports a voluntary review before the UTC deadline, never exposes the wallet", () => {
  const calendar = buildArisanFundingCalendar(scope, options);
  assert.ok(calendar);
  assert.equal(calendar.reminderAt, deadline - 86_400);
  assert.equal(calendar.filename, "salapi-arisan-9-funding.ics");
  assert.ok(calendar.contents.endsWith("\r\n"));
  const unfolded = calendar.contents.replace(/\r\n /g, "");
  assert.match(unfolded, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
  assert.match(unfolded, /DTSTAMP:\d{8}T\d{6}Z\r\n/);
  assert.match(unfolded, /DTSTART:\d{8}T\d{6}Z\r\n/);
  assert.match(unfolded, /DTEND:\d{8}T\d{6}Z\r\n/);
  assert.match(unfolded, /No automatic debit\./);
  assert.match(unfolded, /not a payment authorization/);
  assert.match(unfolded, /Remove the imported event yourself/);
  assert.match(unfolded, /Remaining deposit: 1\.5 Testnet XLM\./);
  assert.doesNotMatch(unfolded, /TZID|ATTENDEE|ORGANIZER|mailto:|https?:/);
  assert.equal(unfolded.includes(scope.viewer), false);
  assert.equal(unfolded.includes(scope.contractId), false);
  assert.equal(unfolded.split("BEGIN:VEVENT").length, 2);
  assert.equal(unfolded.split("BEGIN:VALARM").length, 2);
  for (const physicalLine of calendar.contents.trimEnd().split("\r\n")) assert.ok(Buffer.byteLength(physicalLine, "utf8") <= 75);
});

test("late calendar requests remain before deadline and do not reuse a past event", () => {
  const calendar = buildArisanFundingCalendar(scope, { ...options, now: deadline - 300 });
  assert.ok(calendar);
  assert.equal(calendar.reminderAt, deadline - 299);
  assert.ok(calendar.reminderAt < deadline);
  assert.ok(calendar.reminderAt > deadline - 300);
});

test("UTC deadline format is explicit and independent of the browser timezone", () => {
  assert.equal(formatFundingDeadlineUtc(1_791_369_600), "2026-10-07 10:40:00 UTC");
  assert.equal(formatFundingDeadlineUtc(253_402_300_799), "9999-12-31 23:59:59 UTC");
});

// This exercises actual component handlers with a deterministic React/storage
// harness. It is not a browser E2E or proof of a calendar application's alert.
type Node = { type: string; props: Record<string, unknown> };
type Props = ArisanFundingReminderScope & { deadline: number; remainingStroops: string; status: "Open" | "Active" | "Done" | "Dissolved" };
const componentCode = ts.transpileModule(readFileSync(new URL("../components/screens/ArisanFundingReminder.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function nodes(value: unknown): Node[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object" || !("props" in value)) return []; const node = value as Node; return [node, ...nodes(node.props.children)]; }
function content(value: unknown): string { if (typeof value === "string" || typeof value === "number") return String(value); if (Array.isArray(value)) return value.map(content).join(""); return value && typeof value === "object" && "props" in value ? content((value as Node).props.children) : ""; }
function componentHarness(initial: Partial<Props> = {}, data = new Map<string, string>()) {
  let props: Props = { ...scope, ...options, ...initial };
  let currentTime = now;
  let mode: "get" | "set" | "drop" | "remove" | "getter" | null = null;
  let tree: unknown;
  let dirty = false;
  let cursor = 0;
  let nextTimer = 1;
  const states: unknown[] = [];
  const timers = new Map<number, () => void>();
  const intervals = new Map<number, () => void>();
  const listeners = new Map<string, Set<(event?: { key?: string | null }) => void>>();
  const effects = new Map<number, { deps: readonly unknown[]; cleanup?: () => void }>();
  const queuedEffects: { index: number; effect: () => void | (() => void); deps: readonly unknown[] }[] = [];
  const downloads = { clicked: 0, removed: 0, created: [] as Blob[], revoked: [] as string[] };
  const storage = {
    getItem(key: string) { if (mode === "get") throw new Error("Denied read"); return data.get(key) ?? null; },
    setItem(key: string, value: string) { if (mode === "set") throw new Error("Denied write"); if (mode !== "drop") data.set(key, value); },
    removeItem(key: string) { if (mode === "remove") throw new Error("Denied remove"); data.delete(key); },
  };
  const browser = {
    get localStorage() { if (mode === "getter") throw new Error("Storage blocked"); return storage; },
    setTimeout(callback: () => void) { const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    setInterval(callback: () => void) { const id = nextTimer++; intervals.set(id, callback); return id; },
    clearInterval(id: number) { intervals.delete(id); },
    addEventListener(name: string, callback: (event?: { key?: string | null }) => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(callback); },
    removeEventListener(name: string, callback: (event?: { key?: string | null }) => void) { listeners.get(name)?.delete(callback); },
  };
  const jsx = (type: unknown, props: Record<string, unknown>): Node => ({ type: String(type), props });
  const componentModule = { exports: {} as { default(props: Props): unknown } };
  runInNewContext(componentCode, {
    exports: componentModule.exports, module: componentModule, window: browser, Date: { now: () => currentTime * 1000 }, Blob,
    URL: { createObjectURL(blob: Blob) { downloads.created.push(blob); return `blob:test-${downloads.created.length}`; }, revokeObjectURL(url: string) { downloads.revoked.push(url); } },
    document: { createElement() { return { href: "", download: "", click() { downloads.clicked++; }, remove() { downloads.removed++; } }; }, body: { appendChild() {} } },
    require(name: string) {
      if (name === "react") return {
        useId: () => "reminder-checkbox",
        useRef(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = { current: initial }; return states[index]; },
        useState(initial: unknown) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial; return [states[index], (value: unknown) => { const next = typeof value === "function" ? value(states[index]) : value; if (!Object.is(states[index], next)) { states[index] = next; dirty = true; } }]; },
        useEffect(effect: () => void | (() => void), deps: readonly unknown[]) { const index = cursor++; const old = effects.get(index); if (!old || deps.some((value, index) => !Object.is(value, old.deps[index]))) queuedEffects.push({ index, effect, deps }); },
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en" }) };
      if (name === "@/lib/arisan-funding-reminders") return reminderApi;
      if (name.endsWith(".module.css")) return { default: new Proxy({}, { get: (_, key) => String(key) }) };
      throw new Error(`Unexpected reminder component import: ${name}`);
    },
  });
  function render(flush = true) {
    let loops = 0;
    do {
      dirty = false; cursor = 0;
      tree = componentModule.exports.default(props);
      for (const { index, effect, deps } of queuedEffects.splice(0)) { effects.get(index)?.cleanup?.(); effects.set(index, { deps, cleanup: effect() || undefined }); }
      if (flush) for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
      if (++loops > 10) throw new Error("Unexpected component render loop");
    } while (flush && dirty);
    return tree;
  }
  render();
  return {
    get tree() { return tree; }, get text() { return content(tree); }, data, downloads, intervals, listeners,
    checkbox() { return nodes(tree).find(node => node.type === "input")!; },
    toggle(checked: boolean) { const input = this.checkbox(); (input.props.onChange as (event: unknown) => void)({ currentTarget: { checked } }); render(); },
    click(label: string) { const button = nodes(tree).find(node => node.type === "button" && content(node) === label); assert.ok(button, label); (button.props.onClick as () => void)(); render(); },
    mode(value: typeof mode) { mode = value; },
    replace(changes: Partial<Props>, flush = true) { props = { ...props, ...changes }; return render(flush); },
    advance(seconds: number) { currentTime = seconds; for (const callback of intervals.values()) callback(); render(); },
    reload() { for (const callback of listeners.get("focus") ?? []) callback(); render(); },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

test("component opt-in persists on return and opt-out removes its reminder", () => {
  const ui = componentHarness();
  assert.equal(ui.checkbox().props.checked, false);
  assert.equal(ui.checkbox().props.disabled, false);
  assert.match(ui.text, /Email and push aren't enabled\. No automatic debit\./);
  assert.doesNotMatch(ui.text, /Reminder: your remaining deposit is/);
  ui.toggle(true);
  assert.equal(ui.checkbox().props.checked, true);
  assert.match(ui.text, /Reminder: your remaining deposit is 1\.5 Testnet XLM\./);
  const restored = componentHarness({}, ui.data);
  assert.equal(restored.checkbox().props.checked, true);
  restored.toggle(false);
  assert.equal(restored.checkbox().props.checked, false);
  assert.equal(restored.data.size, 0);
  assert.doesNotMatch(restored.text, /Reminder: your remaining deposit is/);
  ui.unmount(); restored.unmount();
});

test("account, room, and contract changes cannot flash the previous scope's opt-in", () => {
  for (const change of [{ viewer: "G" + "C".repeat(55) }, { roomId: 10 }, { contractId: "C" + "B".repeat(55) }]) {
    const ui = componentHarness(); ui.toggle(true);
    ui.replace(change, false);
    assert.equal(ui.checkbox().props.checked, false);
    assert.equal(ui.checkbox().props.disabled, true);
    assert.match(ui.text, /Checking this browser's reminder preference/);
    ui.reload();
    assert.equal(ui.checkbox().props.checked, false);
    assert.equal(ui.checkbox().props.disabled, false);
    assert.equal(ui.data.size, 1);
    ui.unmount();
  }
});

test("component shows storage errors and never claims blocked or silently dropped opt-in saved", () => {
  for (const mode of ["set", "drop", "getter"] as const) {
    const ui = componentHarness(); ui.mode(mode); ui.toggle(true);
    assert.equal(ui.checkbox().props.checked, false);
    assert.equal(ui.checkbox().props.disabled, true);
    assert.match(ui.text, /not confirmed as enabled/);
    assert.doesNotMatch(ui.text, /Reminder: your remaining deposit is/);
    assert.ok(nodes(ui.tree).some(node => node.props.role === "alert"));
    ui.mode(null); ui.click("Retry browser storage");
    assert.equal(ui.checkbox().props.checked, false);
    assert.equal(ui.checkbox().props.disabled, false);
    ui.unmount();
  }
});

test("failed opt-out becomes unknown rather than pretending an existing reminder was removed", () => {
  const ui = componentHarness(); ui.toggle(true); ui.mode("remove"); ui.toggle(false);
  assert.equal(ui.checkbox().props.checked, false);
  assert.equal(ui.checkbox().props.disabled, true);
  assert.match(ui.text, /not confirmed as enabled/);
  assert.equal(ui.data.size, 1);
  ui.mode(null); ui.click("Retry browser storage");
  assert.equal(ui.checkbox().props.checked, true);
  assert.equal(ui.checkbox().props.disabled, false);
  ui.unmount();
});

test("a corrupt preference can be explicitly reset without touching another wallet", () => {
  const other = { ...scope, viewer: "G" + "C".repeat(55) };
  const data = new Map([[arisanFundingReminderKey(scope)!, "corrupt"], [arisanFundingReminderKey(other)!, JSON.stringify({ version: 1, enabled: true })]]);
  const ui = componentHarness({}, data);
  assert.equal(ui.checkbox().props.disabled, true);
  ui.click("Turn off and reset this room's reminder");
  assert.equal(ui.checkbox().props.disabled, false);
  assert.equal(ui.checkbox().props.checked, false);
  assert.equal(ui.data.has(arisanFundingReminderKey(scope)!), false);
  assert.deepEqual(readArisanFundingReminder(memoryFromMap(data), other), { ok: true, enabled: true });
  ui.unmount();
});

function memoryFromMap(data: Map<string, string>): FundingReminderStorage {
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}

test("deadline timer suppresses the payment reminder and offers cancellation guidance", () => {
  const ui = componentHarness(); ui.toggle(true); ui.advance(deadline);
  assert.match(ui.text, /deadline has passed/);
  assert.match(ui.text, /cancellation or refund/);
  assert.doesNotMatch(ui.text, /Reminder: your remaining deposit is/);
  const calendar = nodes(ui.tree).find(node => node.type === "button" && content(node) === "Download calendar reminder");
  assert.equal(calendar?.props.disabled, true);
  ui.unmount();
});

test("fully funded and closed rooms suppress UI and clean up timers and event listeners", () => {
  for (const change of [{ remainingStroops: "0" }, { status: "Active" as const }, { status: "Done" as const }, { status: "Dissolved" as const }]) {
    const ui = componentHarness(); ui.toggle(true); assert.equal(ui.intervals.size, 1);
    ui.replace(change);
    assert.equal(ui.tree, null);
    assert.equal(ui.intervals.size, 0);
    assert.equal(ui.listeners.get("focus")?.size, 0);
    assert.equal(ui.listeners.get("storage")?.size, 0);
    assert.equal(ui.data.size, 1, "Preference is suppressed, not silently edited");
    ui.unmount();
  }
});

test("unmount removes the clock and all scope listeners", () => {
  const ui = componentHarness();
  assert.equal(ui.intervals.size, 1);
  assert.equal(ui.listeners.get("focus")?.size, 1);
  assert.equal(ui.listeners.get("storage")?.size, 1);
  ui.unmount();
  assert.equal(ui.intervals.size, 0);
  assert.equal(ui.listeners.get("focus")?.size, 0);
  assert.equal(ui.listeners.get("storage")?.size, 0);
});

test("calendar handler prepares a real .ics blob without pretending a notification was scheduled", async () => {
  const ui = componentHarness(); ui.click("Download calendar reminder");
  assert.equal(ui.downloads.clicked, 1);
  assert.equal(ui.downloads.removed, 1);
  assert.equal(ui.downloads.created[0].type, "text/calendar;charset=utf-8");
  assert.match(await ui.downloads.created[0].text(), /^BEGIN:VCALENDAR\r\n/);
  assert.equal((await ui.downloads.created[0].text()).includes(scope.viewer), false);
  assert.deepEqual(ui.downloads.revoked, ["blob:test-1"]);
  assert.match(ui.text, /Import it yourself; no alert has been scheduled by Salapi\./);
  assert.equal(ui.data.size, 0, "Calendar download is not an opt-in or payment");
  ui.unmount();
});
