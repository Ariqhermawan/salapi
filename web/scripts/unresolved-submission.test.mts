import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type RecordValue = { version: 1; id: string; hash: string | null };
type State = { kind: "clear" | "unavailable" } | { kind: "locked"; record: RecordValue };
type Result = { ok: boolean; pending?: boolean; hash?: string; error?: string };
type Guard = { state: State; locked: boolean; notice: string; run(fn: () => Promise<Result>): Promise<Result | null>; check(): Promise<boolean> };
type Library = { readSubmissionState(context: string): State; beginSubmission(context: string): RecordValue | null; resolveSubmission(context: string, record: RecordValue, result: Result): State };
const hash = "a".repeat(64);
const context = "arisan:rooms";
const storageKey = (name: string) => `salapi:testnet:unresolved:v1:${name}`;
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const libraryCode = compile("../lib/ui/unresolved-submission.ts");
const hookCode = compile("../lib/ui/useUnresolvedSubmission.ts");

// Execute the actual helper and hook with a browser-session storage boundary.
// The only mocked server action is a read-only status query, never a submission.
function setup(options: { preview?: boolean; server?: boolean; mode?: "get" | "set" | "drop" | "remove"; data?: Map<string, string>; result?: Result; throwsCheck?: boolean } = {}) {
  const data = options.data ?? new Map<string, string>();
  let mode = options.mode;
  const calls = { writes: 0, reads: 0, removes: 0, checks: 0 };
  const storage = {
    getItem(key: string) { calls.reads++; if (mode === "get") throw new Error("Storage denied"); return data.get(key) ?? null; },
    setItem(key: string, raw: string) { calls.writes++; if (mode === "set") throw new Error("Storage denied"); if (mode !== "drop") data.set(key, raw); },
    removeItem(key: string) { calls.removes++; if (mode === "remove") throw new Error("Storage denied"); data.delete(key); },
  };
  const browser = new EventTarget();
  let nextId = 0;
  const timers: (() => void)[] = [];
  const globals = { window: options.server ? undefined : browser, Event, sessionStorage: storage,
    crypto: { randomUUID: () => `00000000-0000-0000-0000-${String(++nextId).padStart(12, "0")}` },
    setTimeout: (fn: () => void) => { timers.push(fn); return 1; }, clearTimeout: () => {},
    fetch: () => { throw new Error("No network request is authorized"); } };
  function load<T>(code: string, dependencies: Record<string, unknown>): T {
    const sandboxModule = { exports: {} as T };
    runInNewContext(code, { ...globals, module: sandboxModule, exports: sandboxModule.exports, require: (name: string) => { assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name]; } });
    return sandboxModule.exports;
  }
  const preview = { isLocalPreview: options.preview ?? false };
  const library = load<Library>(libraryCode, { "../local-preview": preview });
  function mount(name = context) {
    const state: unknown[] = []; let cursor = 0; let initial = true;
    const hook = load<{ useUnresolvedSubmission(name: string): Guard }>(hookCode, {
      react: {
        useState(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = value; return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; },
        useRef(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: value }; return state[index]; },
        useEffect(fn: () => void) { if (initial) fn(); },
      },
      "@/lib/local-preview": preview,
      "./unresolved-submission": library,
      "@/app/actions": { checkSubmittedTransaction: async (reported: string) => { calls.checks++; assert.equal(reported, hash); if (options.throwsCheck) throw new Error("Status connection lost"); return options.result ?? { ok: false, pending: true, hash }; } },
    });
    const render = () => { cursor = 0; const guard = hook.useUnresolvedSubmission(name); initial = false; return guard; };
    let current = render(); while (timers.length) timers.shift()!(); current = render();
    return { get guard() { return current; }, render() { current = render(); return current; } };
  }
  return { data, calls, library, mount, mode(value?: typeof mode) { mode = value; } };
}

test("local preview and server rendering never use storage or query Testnet", async () => {
  for (const options of [{ preview: true }, { server: true }]) {
    const env = setup({ ...options, mode: "get" });
    assert.equal(env.library.readSubmissionState(context).kind, "clear");
    assert.equal(env.library.beginSubmission(context), null);
    if (options.preview) { const ui = env.mount(); assert.equal(await ui.guard.run(async () => { throw new Error("Must not call"); }), null); assert.equal(await ui.guard.check(), false); }
    assert.deepEqual(env.calls, { writes: 0, reads: 0, removes: 0, checks: 0 });
  }
});

test("unknown status is persisted before the action and contains no payment payload", async () => {
  const env = setup(); const ui = env.mount(); let actions = 0;
  await ui.guard.run(async () => { actions++; assert.equal(env.library.readSubmissionState(context).kind, "locked"); return { ok: false, pending: true }; });
  const saved = JSON.parse(env.data.get(storageKey(context))!);
  assert.deepEqual(Object.keys(saved).sort(), ["hash", "id", "version"]);
  assert.equal(saved.hash, null); assert.equal(actions, 1); assert.equal(ui.render().locked, true);
});

for (const mode of ["get", "set", "drop"] as const) test(`${mode}: storage denial or failed read-back prevents the action and shows unavailable state`, async () => {
  const env = setup({ mode }); const ui = env.mount(); let actions = 0;
  assert.equal(await ui.guard.run(async () => { actions++; return { ok: true }; }), null);
  assert.equal(actions, 0); assert.equal(ui.render().state.kind, "unavailable"); assert.equal(ui.guard.locked, true);
});

test("transport rejection survives a remount and cannot be dismissed or queried without a hash", async () => {
  const env = setup(); const first = env.mount(); let actions = 0;
  await first.guard.run(async () => { actions++; throw new Error("Server response lost"); });
  assert.match(first.render().notice, /without a definitive result/);
  const remount = env.mount(); assert.equal(remount.guard.locked, true);
  assert.equal(await remount.guard.run(async () => { actions++; return { ok: true }; }), null);
  assert.equal(await remount.guard.check(), false); assert.equal(actions, 1); assert.equal(env.calls.checks, 0);
});

test("a second click while the first action is in flight never submits", async () => {
  const env = setup(); const ui = env.mount(); let complete!: (value: Result) => void; let actions = 0;
  const first = ui.guard.run(() => { actions++; return new Promise(resolve => { complete = resolve; }); });
  assert.equal(await ui.guard.run(async () => { actions++; return { ok: true }; }), null);
  complete({ ok: false, pending: true, hash }); await first; assert.equal(actions, 1); assert.equal(ui.render().locked, true);
});

test("known pending hash remains locked across screens in the same context", async () => {
  const env = setup(); const create = env.mount(); await create.guard.run(async () => ({ ok: false, pending: true, hash }));
  const room = env.mount(); assert.equal(room.guard.state.kind, "locked");
  if (room.guard.state.kind === "locked") assert.equal(room.guard.state.record.hash, hash);
  assert.equal(await room.guard.check(), false); assert.equal(room.render().locked, true); assert.equal(env.calls.checks, 1);
});

for (const result of [{ ok: true, hash }, { ok: false, error: "Definitive contract failure" }]) test(`definitive ${result.ok ? "success" : "failure"} clears only the current feature lock`, async () => {
  const data = new Map([["salapi:testnet:unresolved-send:v1", "unknown"], ["salapi.preview.arisan-joined", "1"]]);
  const env = setup({ data }); const record = env.library.beginSubmission(context)!;
  env.library.resolveSubmission(context, record, result);
  assert.equal(env.library.readSubmissionState(context).kind, "clear");
  assert.equal(data.get("salapi:testnet:unresolved-send:v1"), "unknown"); assert.equal(data.get("salapi.preview.arisan-joined"), "1");
});

for (const result of [{ ok: true, hash }, { ok: false, error: "Definitive failure" }]) test(`read-only reconciliation ${result.ok ? "success" : "failure"} never invokes the old mutation or creates a receipt`, async () => {
  const env = setup({ result }); const ui = env.mount(); let actions = 0;
  await ui.guard.run(async () => { actions++; return { ok: false, pending: true, hash }; });
  assert.equal(await ui.guard.check(), true); assert.equal(ui.render().locked, false); assert.equal(actions, 1); assert.equal(env.calls.checks, 1);
  assert.match(ui.guard.notice, result.ok ? /Refresh the feature state/ : /definitive failure/); assert.ok(!("receipt" in ui.guard));
});

test("failed status checks and storage removal failures keep retries locked", async () => {
  for (const options of [{ throwsCheck: true }, { result: { ok: true, hash } }]) {
    const env = setup(options); const ui = env.mount(); await ui.guard.run(async () => ({ ok: false, pending: true, hash }));
    if (!options.throwsCheck) env.mode("remove");
    await ui.guard.check(); assert.equal(ui.render().locked, true); assert.match(ui.guard.notice, /unknown|could not be cleared/);
  }
});

test("late reconciliation cannot remove a newer record and independent contexts remain isolated", () => {
  const env = setup(); const first = env.library.beginSubmission(context)!;
  env.library.resolveSubmission(context, first, { ok: true });
  const second = env.library.beginSubmission(context)!; assert.notEqual(first.id, second.id);
  env.library.resolveSubmission(context, first, { ok: true });
  const current = env.library.readSubmissionState(context); assert.equal(current.kind, "locked");
  if (current.kind === "locked") assert.equal(current.record.id, second.id);
  assert.ok(env.library.beginSubmission("campaign:d4")); assert.ok(env.library.beginSubmission("disaster:d3"));
});

test("malformed or tampered records fail closed, not as a fabricated success", () => {
  for (const raw of ["{", "null", JSON.stringify({ version: 2 }), JSON.stringify({ version: 1, id: "bad", hash }), JSON.stringify({ version: 1, id: "0".repeat(36), hash: hash.toUpperCase() }), "x".repeat(257)]) {
    const env = setup({ data: new Map([[storageKey(context), raw]]) });
    assert.equal(env.library.readSubmissionState(context).kind, "unavailable"); assert.equal(env.library.beginSubmission(context), null);
  }
  assert.equal(setup().library.readSubmissionState("../../other-key").kind, "unavailable");
});

test("all inventoried money screens contain guard wrapping and shared route contexts", () => {
  const expected = { SavingsScreen: ["savings:experimental", "smartSavingsOpen", "smartSavingsDeposit", "smartSavingsWithdraw"], PaluwaganScreen: ["paluwagan:legacy"], ArisanCreateScreen: [context, "arisanCreate"], ArisanJoinScreen: [context, "arisanJoin"], ArisanRoomScreen: [context, "arisanFinalize"], CampaignScreen: ["campaign:d4"], TransparencyScreen: ["disaster:d3", "disasterContribute"] };
  for (const [screen, [name, ...actions]] of Object.entries(expected)) {
    const source = readFileSync(new URL(`../components/screens/${screen}.tsx`, import.meta.url), "utf8");
    assert.ok(source.includes(`useUnresolvedSubmission("${name}")`), screen); assert.match(source, /SubmissionStatusPanel/); assert.match(source, /submission\.run\(/);
    for (const action of actions) assert.ok(source.includes(`submission.run(() => ${action}(`), `${screen}/${action}`);
  }
  const d3 = readFileSync(new URL("../components/DisasterControls.tsx", import.meta.url), "utf8"); assert.match(d3, /useUnresolvedSubmission\("disaster:d3"\)/); assert.match(d3, /await submission\.run\(/);
  const panel = readFileSync(new URL("../components/ui/SubmissionStatusPanel.tsx", import.meta.url), "utf8"); assert.match(panel, /not a payment receipt/); assert.doesNotMatch(panel, /beginSubmission|\.run\(|clearSubmission|Retry transaction/);
});

test("legacy Paluwagan preview does not label fixture balances or reminders as live activity", () => {
  const source = readFileSync(new URL("../components/screens/PaluwaganScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /isLocalPreview \? m\("Local example"\) : t\("paluwagan\.live"\)/);
  assert.match(source, /isLocalPreview \? m\("Example contribution status only\. No tokens are held or moved by this preview\."\)/);
  assert.match(source, /No messages or notifications are sent/);
  assert.doesNotMatch(source, /t\("paluwagan\.reminderBody"\)/);
});
