import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as schedule from "../lib/arisan-schedule.ts";
import * as gathering from "../lib/arisan-gatherings.ts";

type Node = { type: string; props: Record<string, unknown> };
const source = readFileSync(new URL("../components/screens/ArisanGatheringPanel.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const contractId = "C" + "A".repeat(55), viewer = "G" + "A".repeat(55);
const startsAt = new Date(Date.now() + 5 * 86400_000).toISOString();
const saved: gathering.ArisanGathering = { id: "11111111-1111-4111-8111-111111111111", kind: "scheduled", roomId: 9, contractId, revision: 1, mode: "in_person", venueName: "Community Hall", address: "Jalan Mawar 1", mapsUrl: "https://www.google.com/maps/place/Test", onlineUrl: "", startsAt, timeZone: "Asia/Jakarta", updatedAt: new Date().toISOString() };
const defaultState: Extract<gathering.ArisanGatheringResult, { ok: true }> = { ok: true, contractId, viewer, canEdit: true, gathering: null, rsvps: [], notifications: [], unreadCount: 0, delivery: "in_app" };
const nodes = (value: unknown): Node[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" && "props" in value ? [value as Node, ...nodes((value as Node).props.children)] : [];
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) ? value.map(text).join("") : value && typeof value === "object" && "props" in value ? text((value as Node).props.children) : "";

function setup({ preview = false, state = defaultState }: { preview?: boolean; state?: gathering.ArisanGatheringResult } = {}) {
  const cells: unknown[] = []; let cursor = 0, dirty = true, sequence = 0, tree: unknown;
  let watchVersion = "";
  const effects = new Map<number, { deps: readonly unknown[]; cleanup?: () => void }>();
  const scheduled: { index: number; callback: () => void | (() => void); deps: readonly unknown[] }[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>(); let timer = 0;
  let readState = state;
  let watch = async () => ({ ok: true, notifiedMembers: 0, delivery: "in_app" });
  let post = async (body: Record<string, unknown>) => ({ ok: true, gathering: { ...saved, ...body, contractId, revision: Number(body.expectedRevision) + 1 }, notifiedMembers: 3, delivery: "in_app" });
  const calls: { url: string; body?: Record<string, unknown> }[] = [];
  const watchCalls: { url: string; body?: Record<string, unknown> }[] = [];
  const react = {
    useState(initial: unknown) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial; return [cells[index], (value: unknown) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; dirty = true; }]; },
    useRef(value: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: value }); },
    useCallback(callback: unknown, deps: readonly unknown[]) { const index = cursor++; const previous = cells[index] as { callback: unknown; deps: readonly unknown[] } | undefined; if (!previous || deps.some((value, at) => !Object.is(value, previous.deps[at]))) cells[index] = { callback, deps }; return (cells[index] as { callback: unknown }).callback; },
    useEffect(callback: () => void | (() => void), deps: readonly unknown[]) { const index = cursor++; const old = effects.get(index); if (!old || deps.some((value, at) => !Object.is(value, old.deps[at]))) scheduled.push({ index, callback, deps }); },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? type(props) : { type: String(type), props };
  const component = { exports: {} as { default(props: Record<string, unknown>): unknown } };
  runInNewContext(code, { module: component, exports: component.exports, AbortController, URL, Intl, Date,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    setTimeout(callback: () => void, delay = 0) { const id = ++timer; timers.set(id, { callback, delay }); return id; }, clearTimeout(id: number) { timers.delete(id); }, setInterval() { return 1; }, clearInterval() {},
    async fetch(url: string, options: { method?: string; body?: string } = {}) {
      const body = options.body ? JSON.parse(options.body) as Record<string, unknown> : undefined; (url.endsWith("/watch") ? watchCalls : calls).push({ url, ...(body ? { body } : {}) });
      const result = options.method === "POST" ? url.endsWith("/rsvp") ? { ok: true, response: body?.response } : url.endsWith("/watch") ? await watch() : await post(body!) : readState;
      return { ok: result.ok, status: result.ok ? 200 : 409, json: async () => result };
    },
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "next/link") return { default: (props: Record<string, unknown>) => jsx("a", props) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en" }) };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/lib/arisan-schedule") return schedule;
      if (name === "@/lib/arisan-gatherings") return gathering;
      if (name.endsWith(".module.css")) return { default: {} };
      throw Error(`Unexpected panel dependency ${name}`);
    },
  });
  function render() { dirty = false; cursor = 0; tree = component.exports.default({ kind: "scheduled", roomId: 9, contractId, watchVersion }); while (scheduled.length) { const effect = scheduled.shift()!; effects.get(effect.index)?.cleanup?.(); effects.set(effect.index, { deps: effect.deps, cleanup: effect.callback() || undefined }); } }
  async function settle() { for (let turn = 0; turn < 30; turn++) { if (dirty) render(); for (const [id, value] of [...timers]) if (value.delay === 0) { timers.delete(id); value.callback(); } await Promise.resolve(); } if (dirty) render(); }
  render();
  return { calls, watchCalls, settle, get tree() { return tree; }, get text() { return text(tree); },
    state(value: gathering.ArisanGatheringResult) { readState = value; }, post(value: typeof post) { post = value; }, watch(value: typeof watch) { watch = value; },
    version(value: string) { watchVersion = value; dirty = true; },
    async click(label: string) { const node = nodes(tree).find(node => node.type === "button" && text(node) === label); assert.ok(node, label); assert.ok(!node.props.disabled, label); (node.props.onClick as () => void)(); await settle(); },
    async field(label: string, value: string) { const node = nodes(tree).find(node => node.type === "label" && text(node).startsWith(label)); assert.ok(node, label); const input = nodes(node).find(node => ["input", "textarea", "select"].includes(node.type)); assert.ok(input); (input.props.onChange as (event: unknown) => void)({ target: { value } }); await settle(); },
    submit() { const form = nodes(tree).find(node => node.type === "form"); assert.ok(form); (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} }); },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

test("local preview never fetches, saves or claims inbox delivery", async () => {
  const ui = setup({ preview: true }); await ui.settle(); assert.match(ui.text, /unavailable in local preview/); assert.equal(ui.calls.length, 0); assert.ok(!nodes(ui.tree).some(node => node.type === "form")); ui.unmount();
});
test("unauthorized and cross-contract reads cannot expose host editing", async () => {
  for (const state of [{ ok: false as const, code: "unauthorized" as const, error: "Sign in" }, { ...defaultState, contractId: "OTHER" }]) {
    const ui = setup({ state }); await ui.settle(); assert.ok(nodes(ui.tree).some(node => node.props.role === "alert")); assert.ok(!ui.text.includes("Plan or edit gathering")); ui.unmount();
  }
});
test("host save binds room revision, formats timezone and only claims member inbox enqueue", async () => {
  const ui = setup(); await ui.settle(); await ui.click("Plan or edit gathering"); await ui.field("Place name", "Community Hall"); await ui.field("Full address", "Jalan Mawar 1"); await ui.field("Google Maps link", saved.mapsUrl); await ui.field("Meeting date", new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10)); await ui.field("Meeting timezone", "Asia/Jakarta"); ui.submit(); await ui.settle();
  const savedCall = ui.calls.find(call => call.body)!; assert.equal(savedCall.url, "/api/arisan/gatherings"); assert.equal(savedCall.body?.kind, "scheduled"); assert.equal(savedCall.body?.roomId, 9); assert.equal(savedCall.body?.expectedRevision, 0); assert.equal(savedCall.body?.timeZone, "Asia/Jakarta"); assert.match(String(savedCall.body?.startsAt), /T12:00:00\.000Z$/); assert.match(ui.text, /member inboxes: 3/); assert.match(ui.text, /not proof that a member read/); ui.unmount();
});
test("unknown save retries exact mutation UUID/body and blocks rapid duplicate requests", async () => {
  const ui = setup(); await ui.settle(); await ui.click("Plan or edit gathering");
  ui.post(async () => { throw Error("Lost response"); }); ui.submit(); ui.submit(); await ui.settle();
  assert.equal(ui.calls.filter(call => call.body).length, 1); assert.match(ui.text, /save result is unknown/);
  const first = ui.calls.find(call => call.body)!.body;
  ui.post(async body => ({ ok: true, gathering: { ...saved, ...body, contractId, revision: 1 }, notifiedMembers: 3, delivery: "in_app" })); ui.submit(); await ui.settle();
  assert.deepEqual(ui.calls.filter(call => call.body)[1].body, first); ui.unmount();
});
test("editing keeps the original revision even when a refresh loads a newer host plan", async () => {
  const ui = setup({ state: { ...defaultState, gathering: saved } }); await ui.settle(); await ui.click("Plan or edit gathering");
  ui.state({ ...defaultState, gathering: { ...saved, revision: 2 } }); await ui.click("Refresh meeting"); ui.submit(); await ui.settle();
  assert.equal(ui.calls.find(call => call.body)?.body?.expectedRevision, 1); ui.unmount();
});
test("members cannot edit and RSVP binds the visible gathering revision", async () => {
  const ui = setup({ state: { ...defaultState, canEdit: false, gathering: saved } }); await ui.settle(); assert.ok(!ui.text.includes("Plan or edit gathering")); await ui.click("Going");
  const call = ui.calls.find(call => call.url.endsWith("/rsvp"))!; assert.deepEqual(call.body, { kind: "scheduled", roomId: 9, revision: 1, response: "yes" }); ui.unmount();
});
test("malicious stored links are never rendered as external links", async () => {
  const ui = setup({ state: { ...defaultState, gathering: { ...saved, mapsUrl: "javascript:alert(1)", onlineUrl: "https://evil.example" } } }); await ui.settle();
  assert.ok(!nodes(ui.tree).some(node => node.type === "a" && String(node.props.href).includes("evil"))); assert.ok(!nodes(ui.tree).some(node => node.type === "a" && String(node.props.href).startsWith("javascript"))); ui.unmount();
});

test("verified room registers one exact-scope watcher and retries only after a failed registration", async () => {
  const ui = setup(); ui.watch(async () => { throw Error("Unavailable watcher"); }); await ui.settle();
  assert.equal(ui.watchCalls.length, 1); assert.deepEqual(ui.watchCalls[0].body, { kind: "scheduled", roomId: 9 });
  assert.match(ui.text, /No gathering planned yet/); assert.doesNotMatch(ui.text, /Unavailable watcher/);
  ui.watch(async () => ({ ok: true, notifiedMembers: 0, delivery: "in_app" })); await ui.click("Refresh meeting");
  assert.equal(ui.watchCalls.length, 2); await ui.click("Refresh meeting"); assert.equal(ui.watchCalls.length, 2); ui.unmount();
});

test("preview and cross-contract membership cannot register a room watcher", async () => {
  for (const options of [{ preview: true }, { state: { ...defaultState, contractId: "OTHER" } }]) {
    const ui = setup(options); await ui.settle(); assert.equal(ui.watchCalls.length, 0); ui.unmount();
  }
});

test("fresh funding and round transitions refresh then re-register the authoritative watcher", async () => {
  const ui = setup(); await ui.settle(); assert.equal(ui.watchCalls.length, 1);
  ui.version("Open:0:3:3"); await ui.settle(); assert.equal(ui.watchCalls.length, 2);
  ui.version("Active:1:Commit:3:3"); await ui.settle(); assert.equal(ui.watchCalls.length, 3);
  ui.version("Active:2:Commit:3:3"); await ui.settle(); assert.equal(ui.watchCalls.length, 4);
  await ui.click("Refresh meeting"); assert.equal(ui.watchCalls.length, 4); ui.unmount();
});
