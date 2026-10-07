import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as domain from "../lib/arisan-funding.ts";
import * as feePolicy from "../lib/arisan-funding-fees.ts";

// These tests execute the actual screen, status panel, hook and storage helper.
// React scheduling, browser storage and server action transports are isolated
// boundaries. No database, wallet signer, network or live contract is accessed.
type Node = { type: string; props: Record<string, unknown> };
type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
type Result = { ok: boolean; hash?: string; pending?: boolean; id?: number; link?: string; error?: string };
type RecordValue = { version: 1; id: string; hash: string | null };
type State = { kind: "clear" | "unavailable" } | { kind: "locked"; record: RecordValue };
type Library = {
  beginSubmission(context: string): RecordValue | null;
  resolveSubmission(context: string, record: RecordValue, result: Result): State;
  readSubmissionState(context: string): State;
};
const context = "arisan:installment-create";
const hash = "a".repeat(64), otherHash = "b".repeat(64);
const contractId = "C" + "A".repeat(55), otherContract = "C" + "B".repeat(55);
const viewer = "G" + "A".repeat(55), otherViewer = "G" + "B".repeat(55);
const link = `https://stellar.expert/explorer/testnet/tx/${hash}`;
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const sources = {
  helper: compile("../lib/ui/unresolved-submission.ts"),
  hook: compile("../lib/ui/useUnresolvedSubmission.ts"),
  panel: compile("../components/ui/SubmissionStatusPanel.tsx"),
  screen: compile("../components/screens/ArisanFundingScreen.tsx"),
};
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function content(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(content).join("");
  return value && typeof value === "object" && "props" in value ? content((value as Node).props.children) : "";
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup({ lockedHash, storageRemovalDenied = false }: { lockedHash?: string | null; storageRemovalDenied?: boolean } = {}) {
  const data = new Map<string, string>(), cells: unknown[] = [];
  const effects = new Map<number, Effect>(), queuedEffects = new Map<number, Effect>();
  const timers = new Map<number, () => void>(), intervals = new Map<number, () => void>();
  const browser = new EventTarget();
  const calls = { mutations: [] as { method: string; args: unknown[] }[], recoveries: [] as string[], status: [] as string[], paths: [] as string[], lists: 0 };
  let cursor = 0, timerId = 0, sequence = 0, dirty = true, tree: unknown;
  let listResult: Record<string, unknown> = { ready: true, contractId, viewer,
    cadenceSecs: { Weekly: 60, Biweekly: 120, Monthly: 300 }, firstCommitWindow: 300, rooms: [], nextCursor: null };
  let recovery: (reported: string) => Promise<Result> = async reported => ({ ok: true, hash: reported, id: 42, link });
  let status: (reported: string) => Promise<Result> = async reported => ({ ok: true, hash: reported });
  let create: (input: unknown) => Promise<Result> = async () => ({ ok: false, pending: true, hash, link, error: "Creation confirmed; room verification is pending." });
  const globals = {
    window: browser, Event, sessionStorage: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem(key: string, value: string) { data.set(key, value); },
      removeItem(key: string) { if (storageRemovalDenied) throw Error("Denied removal"); data.delete(key); },
    },
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
    setTimeout(callback: () => void) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    setInterval(callback: () => void) { const id = ++timerId; intervals.set(id, callback); return id; },
    clearInterval(id: number) { intervals.delete(id); },
    document: { visibilityState: "visible" },
    fetch() { throw Error("Network forbidden in isolated screen tests"); },
  };
  function load<T>(source: string, dependencies: Record<string, unknown>): T {
    const sandboxModule = { exports: {} as T };
    runInNewContext(source, { ...globals, module: sandboxModule, exports: sandboxModule.exports, require(name: string) {
      assert.ok(name in dependencies, `Unexpected screen dependency: ${name}`);
      return dependencies[name];
    } });
    return sandboxModule.exports;
  }
  function useState(initial: unknown) {
    const index = cursor++;
    if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
    return [cells[index], (next: unknown) => {
      const value = typeof next === "function" ? next(cells[index]) : next;
      if (!Object.is(cells[index], value)) { cells[index] = value; dirty = true; }
    }] as const;
  }
  const react = {
    useState,
    useRef(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: initial }); },
    useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
      const index = cursor++, previous = effects.get(index);
      if (!previous || deps.length !== previous.deps.length || deps.some((value, at) => !Object.is(value, previous.deps[at]))) {
        queuedEffects.set(index, { callback, deps });
      }
    },
    useCallback(callback: unknown, deps: readonly unknown[]) {
      const index = cursor++, previous = cells[index] as { callback: unknown; deps: readonly unknown[] } | undefined;
      if (!previous || deps.length !== previous.deps.length || deps.some((value, at) => !Object.is(value, previous.deps[at]))) cells[index] = { callback, deps };
      return (cells[index] as { callback: unknown }).callback;
    },
    useTransition() {
      const [pending, setPending] = useState(false);
      return [pending, (callback: () => unknown) => {
        setPending(true);
        Promise.resolve().then(callback).finally(() => setPending(false));
      }];
    },
  };
  const jsx = (type: unknown, props: Record<string, unknown>): unknown => typeof type === "function" ? type(props) : { type: String(type), props };
  const jsxRuntime = { jsx, jsxs: jsx };
  const localPreview = { isLocalPreview: false };
  const library = load<Library>(sources.helper, { "../local-preview": localPreview });
  const hook = load(sources.hook, { react, "@/lib/local-preview": localPreview, "./unresolved-submission": library,
    "@/app/actions": { checkSubmittedTransaction(reported: string) { calls.status.push(reported); return status(reported); } } });
  const css = { default: new Proxy({}, { get: (_, key) => String(key) }) };
  const panel = load<{ default(props: Record<string, unknown>): unknown }>(sources.panel, {
    "react/jsx-runtime": jsxRuntime, "next/link": { default: (props: Record<string, unknown>) => jsx("a", props) },
    "./SubmissionStatusPanel.module.css": css,
  });
  const actions: Record<string, unknown> = {
    async fundingList() { calls.lists++; return listResult; },
    async fundingRecoverCreate(reported: string) { calls.recoveries.push(reported); return recovery(reported); },
    async fundingCreate(input: unknown) { calls.mutations.push({ method: "fundingCreate", args: [input] }); return create(input); },
  };
  for (const name of ["fundingState", "fundingResolveCode", "fundingJoin", "fundingDeposit", "fundingStart", "fundingLeave", "fundingCancel", "fundingCommit", "fundingReveal", "fundingFinalize"]) {
    actions[name] = async (...args: unknown[]) => { calls.mutations.push({ method: name, args }); throw Error(`Unexpected mutation ${name}`); };
  }
  const screen = load<{ default(props: { roomId?: number }): unknown }>(sources.screen, {
    react, "react/jsx-runtime": jsxRuntime,
    "next/link": { default: (props: Record<string, unknown>) => jsx("a", props) },
    "next/navigation": { useRouter: () => ({ push: (path: string) => { calls.paths.push(path); } }) },
    "@/components/ui/kit": { AppBar: (props: Record<string, unknown>) => jsx("header", props), Btn: (props: Record<string, unknown>) => jsx("button", props),
      IconButton: (props: Record<string, unknown>) => jsx("button", props), Ico: { back: () => null }, T: { fontSans: "test-font" } },
    "@/lib/ui/useGoBack": { useGoBack: () => () => undefined },
    "@/lib/ui/useUnresolvedSubmission": hook,
    "@/components/ui/SubmissionStatusPanel": panel,
    "@/lib/local-preview": localPreview, "@/lib/arisan-funding": domain,
    "@/lib/arisan-funding-fees": feePolicy,
    "@/app/arisan-funding-actions": actions,
    "./ArisanFundingReminder": { default: () => null },
    "./arisan-funding-preview": { FUNDING_PREVIEW_ACTORS: [viewer, otherViewer], FUNDING_PREVIEW_CONTRACT: contractId },
    "./ArisanFundingScreen.module.css": css,
  });
  if (lockedHash !== undefined) {
    const record = library.beginSubmission(context); assert.ok(record);
    library.resolveSubmission(context, record, { ok: false, pending: true, ...(lockedHash ? { hash: lockedHash } : {}) });
  }
  function render() {
    dirty = false; cursor = 0;
    tree = screen.default({});
    for (const [index, effect] of queuedEffects) {
      effects.get(index)?.cleanup?.();
      effects.set(index, { ...effect, cleanup: effect.callback() || undefined });
    }
    queuedEffects.clear();
  }
  async function settle() {
    for (let loops = 0; loops < 20; loops++) {
      if (dirty) render();
      for (const [id, callback] of [...timers]) { timers.delete(id); callback(); }
      await Promise.resolve(); await Promise.resolve();
    }
    if (dirty || timers.size) throw Error("Screen did not settle");
  }
  render();
  return {
    calls, library, data, settle,
    get tree() { return tree; }, get text() { return content(tree); },
    button(label: string) { const button = nodes(tree).find(node => node.type === "button" && content(node) === label); assert.ok(button, label); return button; },
    click(label: string) {
      const button = this.button(label); assert.equal(!!button.props.disabled, false, `${label} must be enabled`);
      (button.props.onClick as () => void)();
    },
    input(label: string, value: string) {
      const field = nodes(tree).find(node => node.type === "label" && content(node).startsWith(label)); assert.ok(field, label);
      const input = nodes(field).find(node => node.type === "input"); assert.ok(input, label);
      assert.equal(!!input.props.disabled, false);
      (input.props.onChange as (event: unknown) => void)({ target: { value } });
    },
    recover(next: typeof recovery) { recovery = next; },
    status(next: typeof status) { status = next; },
    create(next: typeof create) { create = next; },
    list(next: Record<string, unknown>) { listResult = { ...listResult, ...next }; },
    state() { return library.readSubmissionState(context); },
    unmount() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); },
  };
}

test("a locked create still exposes read-only recovery and opens only its original verified room", async () => {
  const ui = setup({ lockedHash: hash }); await ui.settle();
  assert.equal(ui.button("Review room terms").props.disabled, true);
  assert.equal(ui.button("Refresh verified state").props.disabled, true);
  ui.click("Refresh feature state"); await ui.settle();
  assert.deepEqual(ui.calls.recoveries, [hash]);
  assert.deepEqual(ui.calls.mutations, []);
  assert.deepEqual(ui.calls.paths, ["/arisan/funding/42"]);
  assert.equal(ui.state().kind, "clear");
  assert.match(ui.text, /No transaction was resubmitted/);
  ui.unmount();
});

for (const outcome of ["pending", "mismatch", "failure", "throw"] as const) {
  test(`recovery ${outcome} cannot clear the original hash, navigate or submit another operation`, async () => {
    const ui = setup({ lockedHash: hash });
    ui.recover(async () => {
      if (outcome === "throw") throw Error("Read-only transport interrupted");
      if (outcome === "mismatch") return { ok: true, hash: otherHash, id: 99, link };
      return { ok: false, pending: outcome === "pending", hash, error: "The original receipt is not verified." };
    });
    await ui.settle(); ui.click("Refresh feature state"); await ui.settle();
    const state = ui.state(); assert.equal(state.kind, "locked"); assert.ok(state.kind === "locked"); assert.equal(state.record.hash, hash);
    assert.deepEqual(ui.calls.recoveries, [hash]); assert.deepEqual(ui.calls.paths, []); assert.deepEqual(ui.calls.mutations, []);
    assert.equal(ui.button("Review room terms").props.disabled, true);
    assert.ok(nodes(ui.tree).some(node => node.props.role === "alert"));
    ui.unmount();
  });
}

test("generic RPC SUCCESS retains the lock until the screen independently recovers the original receipt", async () => {
  const ui = setup({ lockedHash: hash }); await ui.settle();
  ui.recover(async () => ({ ok: false, pending: true, hash, error: "Receipt still unresolved." }));
  ui.click("Check submitted status"); await ui.settle();
  assert.deepEqual(ui.calls.status, [hash]); assert.deepEqual(ui.calls.recoveries, [hash]);
  assert.equal(ui.state().kind, "locked"); assert.deepEqual(ui.calls.mutations, []); assert.deepEqual(ui.calls.paths, []);
  ui.recover(async reported => ({ ok: true, hash: reported, id: 42, link }));
  ui.click("Refresh feature state"); await ui.settle();
  assert.equal(ui.state().kind, "clear"); assert.deepEqual(ui.calls.paths, ["/arisan/funding/42"]);
  assert.deepEqual(ui.calls.mutations, []); ui.unmount();
});

test("rapid recovery clicks do not create concurrent reads or resubmit a transaction", async () => {
  const ui = setup({ lockedHash: hash }), response = deferred<Result>();
  ui.recover(() => response.promise); await ui.settle();
  const handler = ui.button("Refresh feature state").props.onClick as () => void;
  handler(); handler(); handler(); await ui.settle();
  assert.deepEqual(ui.calls.recoveries, [hash]); assert.equal(ui.state().kind, "locked");
  assert.deepEqual(ui.calls.mutations, []);
  response.resolve({ ok: true, hash, id: 42, link }); await ui.settle();
  assert.deepEqual(ui.calls.paths, ["/arisan/funding/42"]); assert.equal(ui.state().kind, "clear"); ui.unmount();
});

test("a no-hash unresolved marker cannot invent recovery evidence or unlock creation", async () => {
  const ui = setup({ lockedHash: null }); await ui.settle();
  ui.click("Refresh feature state"); await ui.settle();
  assert.deepEqual(ui.calls.recoveries, []); assert.deepEqual(ui.calls.mutations, []);
  assert.equal(ui.state().kind, "locked"); assert.deepEqual(ui.calls.paths, []); ui.unmount();
});

test("matching receipt cannot pretend a blocked storage removal cleared the safeguard", async () => {
  const ui = setup({ lockedHash: hash, storageRemovalDenied: true }); await ui.settle();
  ui.click("Refresh feature state"); await ui.settle();
  assert.equal(ui.state().kind, "locked"); assert.deepEqual(ui.calls.paths, []); assert.deepEqual(ui.calls.mutations, []);
  assert.match(ui.text, /safeguard could not be cleared/); ui.unmount();
});

test("an unmounted screen ignores a late recovery response without clearing or navigating", async () => {
  const ui = setup({ lockedHash: hash }), response = deferred<Result>();
  ui.recover(() => response.promise); await ui.settle();
  ui.click("Refresh feature state"); await ui.settle(); ui.unmount();
  response.resolve({ ok: true, hash, id: 42, link }); await Promise.resolve(); await Promise.resolve();
  assert.equal(ui.state().kind, "locked"); assert.deepEqual(ui.calls.paths, []); assert.deepEqual(ui.calls.mutations, []);
});

test("the actual create handler binds its reviewed creator and contract, and prevents rapid duplicate submits", async () => {
  const ui = setup(), response = deferred<Result>(); ui.create(() => response.promise); await ui.settle();
  ui.input("Room name", "Family"); await ui.settle(); ui.click("Review room terms"); await ui.settle();
  const handler = ui.button("Confirm room without deposit").props.onClick as () => void;
  handler(); handler(); await ui.settle();
  assert.equal(ui.calls.mutations.length, 1);
  assert.equal(ui.calls.mutations[0].method, "fundingCreate");
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls.mutations[0].args[0])), {
    contractId, expectedViewer: viewer, name: "Family", memberTarget: 3, shareXlm: "1", cadence: "Weekly", fundingDays: 7,
  });
  response.resolve({ ok: false, pending: true, hash, link, error: "Creation verified; room result still pending." }); await ui.settle();
  assert.equal(ui.state().kind, "locked");
  ui.click("Refresh feature state"); await ui.settle();
  assert.deepEqual(ui.calls.recoveries, [hash]); assert.equal(ui.calls.mutations.length, 1);
  assert.equal(ui.state().kind, "clear"); assert.deepEqual(ui.calls.paths, ["/arisan/funding/42"]); ui.unmount();
});

for (const changed of [{ viewer: otherViewer }, { contractId: otherContract }]) {
  test(`a refreshed ${"viewer" in changed ? "account" : "contract"} invalidates the previous create review`, async () => {
    const ui = setup(); await ui.settle(); ui.input("Room name", "Family"); await ui.settle();
    ui.click("Review room terms"); await ui.settle();
    assert.ok(ui.button("Confirm room without deposit"));
    ui.list(changed); ui.click("Refresh verified state"); await ui.settle();
    assert.equal(nodes(ui.tree).some(node => node.type === "button" && content(node) === "Confirm room without deposit"), false);
    assert.equal(ui.button("Review room terms").props.disabled, false); assert.deepEqual(ui.calls.mutations, []); ui.unmount();
  });
}

test("unconfigured and subsequently failed reads disable create review, confirmation and invite review", async () => {
  const fresh = setup(); fresh.list({ ready: false, error: "Installment contract is not configured." }); await fresh.settle();
  fresh.input("Room name", "Family"); fresh.input("Invite code", "FAM234"); await fresh.settle();
  assert.equal(fresh.button("Review room terms").props.disabled, true); assert.equal(fresh.button("Review invitation").props.disabled, true);
  assert.deepEqual(fresh.calls.mutations, []); fresh.unmount();
  const stale = setup(); await stale.settle(); stale.input("Room name", "Family"); await stale.settle();
  stale.click("Review room terms"); await stale.settle();
  stale.list({ ready: false, error: "Verified state unavailable." }); stale.click("Refresh verified state"); await stale.settle();
  assert.equal(stale.button("Confirm room without deposit").props.disabled, true); assert.deepEqual(stale.calls.mutations, []); stale.unmount();
});
