import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type SubmissionRecord = { version: 1; id: string; hash: string | null };
type SubmissionState = { kind: "clear" | "unavailable" } | { kind: "locked"; record: SubmissionRecord };
type Result = { ok: boolean; pending?: boolean; hash?: string; error?: string };
type Options = { keepSuccessLocked?: boolean };
type Guard = {
  state: SubmissionState; locked: boolean; checking: boolean; notice: string;
  run(action: () => Promise<Result>): Promise<Result | null>;
  check(): Promise<boolean>; clearVerified(hash: string): boolean;
};
type Library = {
  readSubmissionState(context: string): SubmissionState;
  beginSubmission(context: string): SubmissionRecord | null;
  resolveSubmission(context: string, record: SubmissionRecord, result: Result): SubmissionState;
};
type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
type StorageMode = "get" | "set" | "drop" | "remove" | undefined;
const context = "circle-donate:tino-relief";
const otherContext = "circle-donate:cats-recovery";
const hash = "a".repeat(64), otherHash = "b".repeat(64);
const storageKey = (name: string) => `salapi:testnet:unresolved:v1:${name}`;
const compile = (path: string) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const helperCode = compile("../lib/ui/unresolved-submission.ts");
const hookCode = compile("../lib/ui/useUnresolvedSubmission.ts");

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

// Both the production hook and production session-storage helper execute here.
// React's state/effect scheduler, browser storage, and read-only RPC transport
// are isolated boundaries. No wallet, database, signer or network is accessed.
function setup({ preview = false, initialMode }: { preview?: boolean; initialMode?: StorageMode } = {}) {
  const data = new Map<string, string>();
  let mode = initialMode, sequence = 0, timerSequence = 0;
  const timers = new Map<number, () => void>();
  const browser = new EventTarget();
  const calls = { reads: 0, writes: 0, removes: 0, checks: [] as { hash: string; response: ReturnType<typeof deferred<Result>> }[] };
  const storage = {
    getItem(key: string) { calls.reads++; if (mode === "get") throw Error("Session storage unavailable"); return data.get(key) ?? null; },
    setItem(key: string, value: string) { calls.writes++; if (mode === "set") throw Error("Session storage unavailable"); if (mode !== "drop") data.set(key, value); },
    removeItem(key: string) { calls.removes++; if (mode === "remove") throw Error("Session storage unavailable"); data.delete(key); },
  };
  const globals = {
    window: browser, Event, sessionStorage: storage,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
    setTimeout(callback: () => void) { const id = ++timerSequence; timers.set(id, callback); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    fetch() { throw Error("Network forbidden in isolated hook tests"); },
  };
  function load<T>(code: string, dependencies: Record<string, unknown>): T {
    const exports = {} as T;
    runInNewContext(code, { ...globals, exports, require(name: string) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    } });
    return exports;
  }
  const localPreview = { isLocalPreview: preview };
  const library = load<Library>(helperCode, { "../local-preview": localPreview });
  function flushTimers() {
    while (timers.size) {
      const [id, callback] = timers.entries().next().value!;
      timers.delete(id); callback();
    }
  }
  function mount(name = context, options?: Options) {
    const cells: unknown[] = [], effects = new Map<number, Effect>(), pendingEffects = new Map<number, Effect>();
    let cursor = 0;
    const hook = load<{ useUnresolvedSubmission(context: string, options?: Options): Guard }>(hookCode, {
      react: {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
          return [cells[index], (next: unknown) => { cells[index] = typeof next === "function" ? next(cells[index]) : next; }];
        },
        useRef(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: initial }); },
        useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
          const index = cursor++, previous = effects.get(index);
          if (!previous || deps.length !== previous.deps.length || deps.some((value, n) => !Object.is(value, previous.deps[n]))) {
            pendingEffects.set(index, { callback, deps });
          }
        },
      },
      "@/lib/local-preview": localPreview,
      "./unresolved-submission": library,
      "@/app/actions": { checkSubmittedTransaction(reported: string) {
        const response = deferred<Result>(); calls.checks.push({ hash: reported, response }); return response.promise;
      } },
    });
    function render() {
      cursor = 0; const value = hook.useUnresolvedSubmission(name, options);
      for (const [index, effect] of pendingEffects) {
        effects.get(index)?.cleanup?.();
        effects.set(index, { ...effect, cleanup: effect.callback() || undefined });
      }
      pendingEffects.clear(); return value;
    }
    render(); flushTimers();
    return { render, cleanup() { for (const effect of effects.values()) effect.cleanup?.(); effects.clear(); } };
  }
  function seed(name = context, storedHash: string | null = hash) {
    const record = library.beginSubmission(name); assert.ok(record, "Fixture must begin through the actual helper");
    library.resolveSubmission(name, record, { ok: false, pending: true, ...(storedHash ? { hash: storedHash } : {}) });
    return record;
  }
  return { data, calls, library, mount, seed, mode(next?: StorageMode) { mode = next; } };
}

function storedHash(env: ReturnType<typeof setup>, name = context) {
  const state = env.library.readSubmissionState(name);
  assert.equal(state.kind, "locked");
  assert.ok(state.kind === "locked");
  return state.record.hash;
}

for (const options of [undefined, { keepSuccessLocked: false }]) {
  test(`default run SUCCESS still clears its feature lock (${JSON.stringify(options)})`, async () => {
    const env = setup(), ui = env.mount(context, options);
    const returned = await ui.render().run(async () => ({ ok: true, hash }));
    assert.equal(returned?.ok, true); assert.equal(ui.render().locked, false);
    assert.equal(env.data.has(storageKey(context)), false);
    assert.equal(ui.render().clearVerified(hash), false, "Manual clear is unavailable without explicit opt-in");
  });
  test(`default check SUCCESS still clears its feature lock (${JSON.stringify(options)})`, async () => {
    const env = setup(); env.seed(); const ui = env.mount(context, options);
    const checked = ui.render().check(); assert.equal(env.calls.checks.length, 1);
    assert.equal(env.calls.checks[0].hash, hash); env.calls.checks[0].response.resolve({ ok: true, hash });
    assert.equal(await checked, true); assert.equal(ui.render().locked, false);
    assert.match(ui.render().notice, /Refresh the feature state/);
  });
}

test("opted-in run SUCCESS returns success but retains only its hash and retry marker", async () => {
  const env = setup(), ui = env.mount(context, { keepSuccessLocked: true }); let actions = 0;
  const returned = await ui.render().run(async () => { actions++; return { ok: true, hash, amount: "50", ownerId: "private", comment: "private" }; });
  assert.equal(returned?.ok, true); assert.equal(storedHash(env), hash); assert.equal(ui.render().locked, true);
  const raw = JSON.parse(env.data.get(storageKey(context))!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(raw).sort(), ["hash", "id", "version"]);
  assert.equal(await ui.render().run(async () => { actions++; return { ok: true, hash: otherHash }; }), null);
  assert.equal(actions, 1, "A second click cannot submit while receipt recovery remains unfinished");
});

test("opted-in run SUCCESS without a valid hash stays unknown rather than inventing recovery evidence", async () => {
  for (const reported of [undefined, "invalid", hash.toUpperCase()]) {
    const env = setup(), ui = env.mount(context, { keepSuccessLocked: true });
    await ui.render().run(async () => ({ ok: true, ...(reported ? { hash: reported } : {}) }));
    assert.equal(storedHash(env), null); assert.equal(ui.render().locked, true);
    assert.equal(await ui.render().check(), false); assert.equal(env.calls.checks.length, 0);
    assert.equal(ui.render().clearVerified(hash), false);
  }
});

test("opted-in read-only SUCCESS check keeps its exact hash across remount until verified receipt save", async () => {
  const env = setup(); env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const checked = ui.render().check(); assert.equal(ui.render().checking, true);
  env.calls.checks[0].response.resolve({ ok: true, hash });
  assert.equal(await checked, true); assert.equal(ui.render().checking, false);
  assert.equal(storedHash(env), hash); assert.equal(ui.render().locked, true);
  assert.match(ui.render().notice, /recovery safeguard remains locked/);
  ui.cleanup(); const remounted = env.mount(context, { keepSuccessLocked: true });
  assert.equal(storedHash(env), hash); assert.equal(remounted.render().locked, true);
  assert.equal(remounted.render().clearVerified(hash), true);
  assert.equal(remounted.render().locked, false); assert.equal(env.data.has(storageKey(context)), false);
});

test("opted-in check SUCCESS without repeating the hash preserves the known hash", async () => {
  const env = setup(); env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const checked = ui.render().check(); env.calls.checks[0].response.resolve({ ok: true });
  assert.equal(await checked, true); assert.equal(storedHash(env), hash); assert.equal(ui.render().locked, true);
});

test("identity or mapping unavailability between checks cannot erase an opted-in successful hash", async () => {
  const env = setup(); env.seed(); let ui = env.mount(context, { keepSuccessLocked: true });
  for (let unavailablePass = 0; unavailablePass < 2; unavailablePass++) {
    const checked = ui.render().check();
    env.calls.checks[unavailablePass].response.resolve({ ok: true, hash });
    assert.equal(await checked, true); assert.equal(storedHash(env), hash);
    // Feature recovery exits without clearing while identity or mapping is
    // unavailable, then a reload creates an independent production hook mount.
    ui.cleanup(); ui = env.mount(context, { keepSuccessLocked: true });
    assert.equal(storedHash(env), hash); assert.equal(ui.render().locked, true);
  }
  assert.equal(ui.render().clearVerified(hash), true); assert.equal(ui.render().notice, "");
});

test("pending check and interrupted transport retain the opt-in hash without another submission", async () => {
  const env = setup(); env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const pending = ui.render().check(); env.calls.checks[0].response.resolve({ ok: false, pending: true, hash });
  assert.equal(await pending, false); assert.equal(storedHash(env), hash);
  const interrupted = ui.render().check(); env.calls.checks[1].response.reject(Error("Transport ended"));
  assert.equal(await interrupted, false); assert.equal(storedHash(env), hash);
  assert.equal(ui.render().locked, true); assert.match(ui.render().notice, /unknown/);
});

test("opted-in definitive failures still unlock their feature without retrying any action", async () => {
  const direct = setup(), directUi = direct.mount(context, { keepSuccessLocked: true }); let actions = 0;
  await directUi.render().run(async () => { actions++; return { ok: false, error: "Definitive failure" }; });
  assert.equal(directUi.render().locked, false); assert.equal(actions, 1);
  const env = setup(); env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const checked = ui.render().check(); env.calls.checks[0].response.resolve({ ok: false, error: "FAILED" });
  assert.equal(await checked, true); assert.equal(ui.render().locked, false);
  assert.match(ui.render().notice, /definitive failure/); assert.equal(env.calls.checks.length, 1);
});

test("clearVerified rejects malformed or mismatched hashes without touching the marker", () => {
  const env = setup(); env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const raw = env.data.get(storageKey(context)), removals = env.calls.removes;
  for (const supplied of ["", "invalid", hash.toUpperCase(), otherHash, "a".repeat(63), "a".repeat(65)]) {
    assert.equal(ui.render().clearVerified(supplied), false); assert.equal(env.data.get(storageKey(context)), raw);
  }
  assert.equal(env.calls.removes, removals); assert.equal(ui.render().locked, true);
});

test("clearVerified affects only its exact feature context and current hash", () => {
  const env = setup(); env.seed(); env.seed(otherContext, otherHash);
  const ui = env.mount(context, { keepSuccessLocked: true }), other = env.mount(otherContext, { keepSuccessLocked: true });
  const otherRaw = env.data.get(storageKey(otherContext));
  assert.equal(ui.render().clearVerified(otherHash), false);
  assert.equal(other.render().clearVerified(hash), false);
  assert.equal(ui.render().clearVerified(hash), true);
  assert.equal(env.data.get(storageKey(otherContext)), otherRaw); assert.equal(other.render().locked, true);
  assert.equal(storedHash(env, otherContext), otherHash); assert.equal(ui.render().clearVerified(hash), false);
});

test("a stale verification callback cannot clear a newer pending transaction hash", () => {
  const env = setup(); const original = env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const staleClear = ui.render().clearVerified;
  env.library.resolveSubmission(context, original, { ok: true, hash });
  env.seed(context, otherHash); const raw = env.data.get(storageKey(context));
  assert.equal(staleClear(hash), false); assert.equal(env.data.get(storageKey(context)), raw);
  assert.equal(storedHash(env), otherHash); assert.equal(ui.render().locked, true);
});

test("a late SUCCESS status response cannot replace or clear a newer feature submission", async () => {
  const env = setup(); const original = env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const checked = ui.render().check();
  env.library.resolveSubmission(context, original, { ok: true, hash }); env.seed(context, otherHash);
  const newerRaw = env.data.get(storageKey(context));
  env.calls.checks[0].response.resolve({ ok: true, hash }); await checked;
  assert.equal(env.data.get(storageKey(context)), newerRaw); assert.equal(storedHash(env), otherHash);
  assert.equal(ui.render().clearVerified(hash), false); assert.equal(ui.render().locked, true);
});

test("clearVerified cannot unlock inaccessible, corrupt or removal-denied storage", () => {
  for (const mode of ["get", "remove"] as const) {
    const env = setup(); env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
    const raw = env.data.get(storageKey(context)); env.mode(mode);
    assert.equal(ui.render().clearVerified(hash), false); assert.equal(env.data.get(storageKey(context)), raw);
    env.mode(); assert.equal(storedHash(env), hash); assert.equal(ui.render().locked, true);
  }
  for (const raw of ["{", "null", "x".repeat(257), JSON.stringify({ version: 2, id: "0".repeat(36), hash })]) {
    const env = setup(); env.data.set(storageKey(context), raw); const ui = env.mount(context, { keepSuccessLocked: true });
    assert.equal(ui.render().state.kind, "unavailable"); assert.equal(ui.render().clearVerified(hash), false);
    assert.equal(env.data.get(storageKey(context)), raw); assert.equal(env.calls.removes, 0);
  }
});

test("opted-in successful status with unavailable storage stays locked instead of fabricating a clear", async () => {
  const env = setup(); env.seed(); const ui = env.mount(context, { keepSuccessLocked: true });
  const checked = ui.render().check(); env.mode("get"); env.calls.checks[0].response.resolve({ ok: true, hash });
  assert.equal(await checked, true); assert.equal(ui.render().state.kind, "unavailable"); assert.equal(ui.render().locked, true);
  assert.equal(ui.render().clearVerified(hash), false); env.mode(); assert.equal(storedHash(env), hash);
});

test("opt-in local preview never writes storage, queries status, or performs an action", async () => {
  const env = setup({ preview: true, initialMode: "get" }), ui = env.mount(context, { keepSuccessLocked: true }); let actions = 0;
  assert.equal(await ui.render().run(async () => { actions++; return { ok: true, hash }; }), null);
  assert.equal(await ui.render().check(), false); assert.equal(ui.render().clearVerified(hash), false);
  assert.equal(actions, 0); assert.equal(ui.render().locked, false);
  assert.equal(env.calls.reads + env.calls.writes + env.calls.removes + env.calls.checks.length, 0);
});

test("native donation opts in and clears recovery only after a saved donor record, not generic SUCCESS", () => {
  const source = readFileSync(new URL("../components/CircleTestnetDonate.tsx", import.meta.url), "utf8");
  assert.match(source, /useUnresolvedSubmission\(`circle-donate:\$\{circle\.id\}`,\s*\{\s*keepSuccessLocked:\s*true\s*\}\)/);
  assert.match(source, /if\s*\(result\.ok\)\s*\{\s*guard\.clearVerified\(entry\.hash\)/);
  assert.equal([...source.matchAll(/guard\.clearVerified\(/g)].length, 1);
});
