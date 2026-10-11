import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as gathering from "../lib/arisan-gatherings.ts";

// Execute the actual client component with deterministic hook and transport
// boundaries. No live session, network, database or wallet signer is accessed.
type Node = { type: string; props: Record<string, unknown> };
const code = ts.transpileModule(readFileSync(new URL("../components/screens/ArisanNotificationsScreen.tsx", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const notification: gathering.ArisanGatheringNotification = { id: "11111111-1111-4111-8111-111111111111", kind: "scheduled", roomId: 9, contractId: "C" + "A".repeat(55), type: "meeting_updated", title: "Meeting updated", body: "Friday at Community Hall", roomName: "Neighbourhood circle", createdAt: "2026-10-11T08:00:00.000Z", readAt: null, gatheringRevision: 1, startsAt: "2026-10-15T12:00:00.000Z", href: "https://evil.example" };
const initial: gathering.ArisanGatheringInboxResult = { ok: true, notifications: [notification], unreadCount: 1, delivery: "in_app" };
const nodes = (value: unknown): Node[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" && "props" in value ? [value as Node, ...nodes((value as Node).props.children)] : [];
const text = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : Array.isArray(value) ? value.map(text).join("") : value && typeof value === "object" && "props" in value ? text((value as Node).props.children) : "";
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; }

function setup({ preview = false, state = initial, locale = "en" }: { preview?: boolean; state?: gathering.ArisanGatheringInboxResult; locale?: "en" | "id" | "tl" | "vi" } = {}) {
  const cells: unknown[] = []; let cursor = 0, dirty = true, tree: unknown;
  const effects = new Map<number, { deps: readonly unknown[]; cleanup?: () => void }>();
  const scheduled: { index: number; callback: () => void | (() => void); deps: readonly unknown[] }[] = [];
  const timers = new Map<number, { callback: () => void; delay: number }>(); let timer = 0;
  let read = async () => state;
  let post: (body: Record<string, unknown>) => Promise<{ ok: boolean; marked?: number; error?: string }> = async () => ({ ok: true, marked: 1 });
  const calls: { method: string; body?: Record<string, unknown> }[] = [];
  const react = {
    useState(initial: unknown) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial; return [cells[index], (value: unknown) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; dirty = true; }]; },
    useRef(value: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: value }); },
    useCallback(callback: unknown, deps: readonly unknown[]) { const index = cursor++; const previous = cells[index] as { callback: unknown; deps: readonly unknown[] } | undefined; if (!previous || deps.some((value, at) => !Object.is(value, previous.deps[at]))) cells[index] = { callback, deps }; return (cells[index] as { callback: unknown }).callback; },
    useEffect(callback: () => void | (() => void), deps: readonly unknown[]) { const index = cursor++; const old = effects.get(index); if (!old || deps.some((value, at) => !Object.is(value, old.deps[at]))) scheduled.push({ index, callback, deps }); },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => typeof type === "function" ? type(props) : { type: String(type), props };
  const component = { exports: {} as { default(): unknown } };
  runInNewContext(code, { module: component, exports: component.exports, AbortController, Date,
    document: { visibilityState: "visible", addEventListener() {}, removeEventListener() {} },
    setTimeout(callback: () => void, delay = 0) { const id = ++timer; timers.set(id, { callback, delay }); return id; }, clearTimeout(id: number) { timers.delete(id); }, setInterval() { return 1; }, clearInterval() {},
    async fetch(url: string, options: { method?: string; body?: string } = {}) {
      assert.equal(url, "/api/arisan/gatherings/inbox"); const body = options.body ? JSON.parse(options.body) as Record<string, unknown> : undefined;
      calls.push({ method: options.method ?? "GET", ...(body ? { body } : {}) });
      const result = options.method === "POST" ? await post(body!) : await read();
      return { ok: result.ok, json: async () => result };
    },
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "next/link") return { default: (props: Record<string, unknown>) => jsx("a", props) };
      if (name === "@/components/ui/kit") return { AppBar: ({ title, leading }: Record<string, unknown>) => jsx("header", { children: [title, leading] }), IconButton: ({ ariaLabel, ...props }: Record<string, unknown>) => jsx("button", { ...props, "aria-label": ariaLabel }), Ico: { back: () => null } };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => {} };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name === "@/lib/arisan-gatherings") return gathering;
      if (name.endsWith(".module.css")) return { default: {} };
      throw Error(`Unexpected inbox dependency ${name}`);
    },
  });
  function render() { dirty = false; cursor = 0; tree = component.exports.default(); while (scheduled.length) { const effect = scheduled.shift()!; effects.get(effect.index)?.cleanup?.(); effects.set(effect.index, { deps: effect.deps, cleanup: effect.callback() || undefined }); } }
  async function settle() { for (let turn = 0; turn < 40; turn++) { if (dirty) render(); for (const [id, value] of [...timers]) if (value.delay === 0) { timers.delete(id); value.callback(); } await Promise.resolve(); } if (dirty) render(); }
  render();
  return { calls, settle, get tree() { return tree; }, get text() { return text(tree); },
    read(value: typeof read) { read = value; }, post(value: typeof post) { post = value; },
    button(label: string) { const found = nodes(tree).find(node => node.type === "button" && text(node) === label); assert.ok(found, label); return found; },
    async click(label: string) { const found = this.button(label); assert.ok(!found.props.disabled, label); (found.props.onClick as () => void)(); await settle(); },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); },
  };
}

test("local preview performs no reads or writes and never simulates persisted notifications", async () => {
  const ui = setup({ preview: true }); await ui.settle(); assert.equal(ui.calls.length, 0); assert.match(ui.text, /No delivery has been simulated/); ui.unmount();
});
test("unauthorized inbox shows a return-to-inbox sign in link without private content", async () => {
  const ui = setup({ state: { ok: false, code: "unauthorized", error: "Signed saved wallet required" } }); await ui.settle();
  assert.ok(nodes(ui.tree).some(node => node.type === "a" && node.props.href === "/signin?next=%2Fnotifications")); assert.doesNotMatch(ui.text, /Community Hall/); ui.unmount();
});
test("notification room links derive the allowlisted scope and ignore arbitrary stored hrefs", async () => {
  const ui = setup(); await ui.settle();
  const links = nodes(ui.tree).filter(node => node.type === "a").map(node => node.props.href);
  assert.ok(links.includes("/arisan/scheduled/9")); assert.ok(!links.includes(notification.href)); assert.match(ui.text, /not proof of email, SMS or push/); ui.unmount();
});
test("single mark read posts only the loaded UUID and does not update optimistically", async () => {
  const ui = setup(); await ui.settle(); const pending = deferred<{ ok: boolean; marked: number }>(); ui.post(() => pending.promise);
  const handler = ui.button("Mark read").props.onClick as () => void; handler(); handler(); await ui.settle();
  assert.equal(ui.calls.filter(call => call.method === "POST").length, 1); assert.deepEqual(ui.calls.find(call => call.body)!.body, { ids: [notification.id] });
  assert.match(ui.text, /Unread/); assert.doesNotMatch(ui.text, /Read status saved/);
  ui.read(async () => ({ ok: true, notifications: [{ ...notification, readAt: "2026-10-11T08:10:00.000Z" }], unreadCount: 0, delivery: "in_app" }));
  pending.resolve({ ok: true, marked: 1 }); await ui.settle(); assert.match(ui.text, /Read status saved/); assert.ok(!nodes(ui.tree).some(node => node.type === "button" && text(node) === "Mark read")); ui.unmount();
});
test("mark all is limited to loaded unread records, not the global unread count", async () => {
  const readId = "22222222-2222-4222-8222-222222222222";
  const ui = setup({ state: { ok: true, notifications: [notification, { ...notification, id: readId, readAt: "2026-10-11T08:10:00.000Z" }], unreadCount: 99, delivery: "in_app" } }); await ui.settle(); await ui.click("Mark loaded updates read");
  assert.deepEqual(ui.calls.find(call => call.body)!.body, { ids: [notification.id] }); assert.match(ui.text, /older updates/); ui.unmount();
});
test("lost mark-read response remains unknown and never claims success", async () => {
  const ui = setup(); await ui.settle(); ui.post(async () => { throw Error("Lost response"); }); await ui.click("Mark read");
  assert.match(ui.text, /Read status could not be confirmed/); assert.doesNotMatch(ui.text, /Read status saved/); ui.unmount();
});
test("failed refresh clears previously loaded private notification content", async () => {
  const ui = setup(); await ui.settle(); assert.match(ui.text, /Community Hall/); ui.read(async () => { throw Error("Expired session"); }); await ui.click("Refresh inbox");
  assert.doesNotMatch(ui.text, /Community Hall/); assert.match(ui.text, /could not be verified/); ui.unmount();
});
test("late initial read after unmount cannot populate the private inbox", async () => {
  const pending = deferred<gathering.ArisanGatheringInboxResult>(); const ui = setup(); ui.read(() => pending.promise); await ui.settle(); ui.unmount();
  pending.resolve(initial); await ui.settle(); assert.doesNotMatch(ui.text, /Community Hall/);
});
test("all four locales have real labels without changing stored notification content", async () => {
  for (const [locale, heading] of [["en", "Stay in the circle"], ["id", "Tetap terhubung"], ["tl", "Manatiling konektado"], ["vi", "Luôn kết nối"]] as const) {
    const ui = setup({ locale }); await ui.settle(); assert.ok(ui.text.includes(heading)); assert.match(ui.text, /Friday at Community Hall/); ui.unmount();
  }
});

test("the reusable inbox link is named and touch-sized in every locale", () => {
  const source = ts.transpileModule(readFileSync(new URL("../components/ArisanInboxLink.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const component = { exports: {} as { default(props: { locale: string }): Node } };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type: String(type), props });
  runInNewContext(source, { module: component, exports: component.exports, require(name: string) { if (name === "next/link") return { default: "a" }; if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }; throw Error(name); } });
  for (const locale of ["en", "id", "tl", "vi"]) { const link = component.exports.default({ locale }); assert.equal(link.props.href, "/notifications"); assert.ok(String(link.props["aria-label"]).length > 0); assert.equal((link.props.style as { width: number }).width, 44); assert.equal((link.props.style as { height: number }).height, 44); }
});
