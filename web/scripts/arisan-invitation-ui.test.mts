import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { pesosToStroopsExact } from "../lib/money.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import type { ArisanReviewedInvitation } from "../lib/arisan-invitation.ts";

const viewer = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const initialNow = 1_800_000_000_000;
type Room = { ready: true; id: number; name: string; memberTarget: number; memberCount: number; sharePesos: number; cadence: string; cadenceSecs: number; status: string; isMember: boolean; joinDeadline: number; shareStroops?: string; depositStroops?: string; viewer?: string | null };
const room = (id = 11, overrides: Partial<Room> = {}): Room => ({ ready: true, id, name: id === 11 ? "Room A" : "Room B", memberTarget: 5, memberCount: 3, sharePesos: 250, cadence: "Weekly", cadenceSecs: 60, status: "Open", isMember: false, joinDeadline: initialNow / 1000 + 60, shareStroops: "384615385", depositStroops: "1923076925", viewer, ...overrides });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
type Element = React.ReactElement<Record<string, unknown>>;
const source = ts.transpileModule(readFileSync(new URL("../components/screens/ArisanJoinScreen.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

// Execute the actual component's handlers and lifecycle with deferred action
// boundaries, and render its JSX with React SSR. No RPC, signer, cloud writes,
// or financial operation can run here. This is component proof, not chain E2E.
function setup() {
  const cells: unknown[] = [];
  const effects = new Map<number, Effect>();
  const scheduled = new Map<number, Effect>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const lookups: { code: string; result: ReturnType<typeof deferred<{ ok: true; code: string; id: number } | { ok: false; error: string }>> }[] = [];
  const rooms: { id: number; result: ReturnType<typeof deferred<Room | { ready: false }>> }[] = [];
  const joins: { invitation: ArisanReviewedInvitation; result: ReturnType<typeof deferred<{ ok: true; id: number } | { ok: false; error: string }>> }[] = [];
  const calls = { backs: 0, navigation: [] as string[], success: [] as string[], network: 0, afterUnmountUpdates: 0 };
  let cursor = 0;
  let now = initialNow;
  let nextTimer = 0;
  let unmounted = false;
  let locked = false;
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (value: unknown) => {
        if (unmounted) calls.afterUnmountUpdates++;
        cells[index] = typeof value === "function" ? value(cells[index]) : value;
      }];
    },
    useRef(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: initial }); },
    useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
      const index = cursor++; const old = effects.get(index);
      if (!old || old.deps.length !== deps.length || deps.some((value, i) => !Object.is(value, old.deps[i]))) scheduled.set(index, { callback, deps });
    },
    useTransition() { return [false, (callback: () => Promise<unknown>) => { void callback(); }]; },
  };
  const Btn = ({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean }) =>
    React.createElement("button", { onClick, disabled: !!disabled || !!loading, "aria-busy": loading || undefined }, children);
  const Card = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
  const AppBar = ({ leading, title }: { leading: React.ReactNode; title: React.ReactNode }) => React.createElement("header", null, leading, title);
  const exports = {} as { default: () => React.ReactElement };
  runInNewContext(source, { exports, Date: { now: () => now },
    setTimeout(callback: () => void, delay: number) { const id = ++nextTimer; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout(id: number) { timers.delete(id); },
    fetch() { calls.network++; throw Error("External network is forbidden in invitation component tests"); },
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/navigation") return { useRouter: () => ({ replace: (path: string) => calls.navigation.push(path), push: (path: string) => calls.navigation.push(path) }) };
      if (name === "next/image") return { __esModule: true, default: (props: Record<string, unknown>) => React.createElement("img", props) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "tl", t: (key: string) => key }) };
      if (name === "@/components/ui/kit") return { T: {}, Ico: { back: () => null }, AppBar, Card, Btn };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => { calls.backs++; } };
      if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ locked, run: (action: () => Promise<unknown>) => action() }) };
      if (name === "@/components/ui/SubmissionStatusPanel") return { __esModule: true, default: () => null };
      if (name === "@/lib/ui/success-feedback") return { announceSuccessMotion: (message: string) => calls.success.push(message) };
      if (name === "@/lib/local-preview") return { isLocalPreview: false, PREVIEW_WALLET };
      if (name === "@/lib/money") return { pesosToStroopsExact };
      if (name === "@/lib/ui/currency") return { formatLocal: (amount: number) => `PHP ${amount}` };
      if (name === "./arisan-preview") return new Proxy({}, { get: () => () => { throw Error("Local storage is forbidden in live invitation tests"); } });
      if (name === "@/app/actions") return {
        arisanResolveCode(code: string) { const result = deferred<{ ok: true; code: string; id: number } | { ok: false; error: string }>(); lookups.push({ code, result }); return result.promise; },
        arisanRoomState(id: number) { const result = deferred<Room | { ready: false }>(); rooms.push({ id, result }); return result.promise; },
        arisanJoin(invitation: ArisanReviewedInvitation) { const result = deferred<{ ok: true; id: number } | { ok: false; error: string }>(); joins.push({ invitation, result }); return result.promise; },
      };
      if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
      throw Error(`Unexpected invitation dependency ${name}`);
    },
  });
  function render() {
    cursor = 0; const tree = exports.default();
    const pending = [...scheduled.entries()]; scheduled.clear();
    for (const [index, effect] of pending) { effects.get(index)?.cleanup?.(); effects.set(index, { ...effect, cleanup: effect.callback() || undefined }); }
    return tree;
  }
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(value)) return [];
    if (typeof value.type === "function") return nodes((value.type as (props: Record<string, unknown>) => unknown)(value.props));
    return [value, ...nodes(value.props.children)];
  }
  function content(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(content).join("");
    return React.isValidElement<Record<string, unknown>>(value) ? content(value.props.children) : "";
  }
  function control(label: string) {
    const node = nodes(render()).find(node => node.type === "button" && (node.props["aria-label"] === label || content(node) === label));
    assert.ok(node, `Missing actual invitation control: ${label}`); return node;
  }
  const input = () => { const node = nodes(render()).find(node => node.type === "input"); assert.ok(node); return node; };
  render();
  return { render, nodes, input, control, calls, lookups, rooms, joins,
    html: () => renderToStaticMarkup(render()),
    click(label: string) { (control(label).props.onClick as () => void)(); },
    code(value: string) { (input().props.onChange as (event: { target: { value: string } }) => void)({ target: { value } }); },
    setLocked(value: boolean) { locked = value; },
    advance(ms: number, fireTimers = true) { now += ms; if (fireTimers) for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
    cleanup() { for (const effect of effects.values()) effect.cleanup?.(); unmounted = true; },
  };
}
async function resolvedReview(ui: ReturnType<typeof setup>, code = "FAM234", value = room()) {
  ui.code(code); ui.click("Review invitation");
  ui.lookups.at(-1)!.result.resolve({ ok: true, code, id: value.id }); await flush();
  ui.rooms.at(-1)!.result.resolve(value); await flush(); ui.render();
}
const invoke = (node: Element) => (node.props.onClick as () => void)();
const expected = (code = "FAM234", id = 11): ArisanReviewedInvitation => ({ code, roomId: id, memberTarget: 5, shareStroops: "384615385", depositStroops: "1923076925", viewer });

test("pending review disables input and rejects the editable A-to-B race before submitting exact reviewed terms", async () => {
  const ui = setup(); ui.code("FAM234"); const input = ui.input(); const review = ui.control("Review invitation"); invoke(review); invoke(review);
  assert.equal(ui.lookups.length, 1); assert.equal(ui.input().props.disabled, true);
  (input.props.onChange as (event: unknown) => void)({ target: { value: "BCD567" } });
  assert.equal(ui.input().props.value, "FAM234");
  ui.lookups[0].result.resolve({ ok: true, code: "FAM234", id: 11 }); await flush(); ui.rooms[0].result.resolve(room()); await flush();
  assert.match(ui.html(), /Room A/); assert.match(ui.html(), /PHP 1250/);
  assert.match(ui.html(), /38\.4615385 Testnet XLM/); assert.match(ui.html(), /192\.3076925 Testnet XLM/);
  assert.match(ui.html(), /Illustrative display only/); assert.match(ui.html(), /60 seconds between rounds \(Testnet\)/);
  ui.click("Confirm deposit and join");
  assert.deepEqual({ ...ui.joins[0].invitation }, expected()); assert.equal(Object.isFrozen(ui.joins[0].invitation), true); assert.equal(ui.calls.network, 0);
  ui.joins[0].result.resolve({ ok: true, id: 11 }); await flush();
  assert.deepEqual(ui.calls.navigation, ["/arisan/11"]); assert.equal(ui.calls.success.length, 1);
});

test("Back cancels a pending resolver and a late old failure cannot hide the newer invitation", async () => {
  const ui = setup(); ui.code("FAM234"); ui.click("Review invitation"); ui.click("Back to arisan rooms");
  assert.equal(ui.calls.backs, 1); assert.equal(ui.input().props.disabled, false);
  await resolvedReview(ui, "BCD567", room(22));
  ui.lookups[0].result.resolve({ ok: false, error: "Old A lookup failed" }); await flush();
  assert.match(ui.html(), /Room B/); assert.doesNotMatch(ui.html(), /Old A lookup failed|Room A/); assert.equal(ui.rooms.length, 1);
  ui.click("Confirm deposit and join"); assert.deepEqual({ ...ui.joins[0].invitation }, expected("BCD567", 22));
});

test("a cancelled delayed room A lookup cannot replace an already reviewed room B", async () => {
  const ui = setup(); ui.code("FAM234"); ui.click("Review invitation"); ui.lookups[0].result.resolve({ ok: true, code: "FAM234", id: 11 }); await flush();
  ui.click("Back to arisan rooms"); await resolvedReview(ui, "BCD567", room(22));
  ui.rooms[0].result.resolve(room()); await flush();
  assert.match(ui.html(), /Room B/); assert.doesNotMatch(ui.html(), /Room A/);
  ui.click("Confirm deposit and join"); assert.deepEqual({ ...ui.joins[0].invitation }, expected("BCD567", 22));
});

test("stale confirmation handlers are invalidated when the user chooses another invite", async () => {
  const ui = setup(); await resolvedReview(ui); const staleConfirm = ui.control("Confirm deposit and join");
  ui.click("Use another invite"); invoke(staleConfirm); assert.equal(ui.joins.length, 0);
  await resolvedReview(ui, "BCD567", room(22)); invoke(staleConfirm); assert.equal(ui.joins.length, 0);
  ui.click("Confirm deposit and join"); assert.deepEqual({ ...ui.joins[0].invitation }, expected("BCD567", 22));
});

test("later changes to the read result cannot mutate the displayed room or accepted invitation", async () => {
  const ui = setup(); const current = room(); await resolvedReview(ui, "FAM234", current);
  current.id = 22; current.name = "Changed room"; current.memberTarget = 10; current.shareStroops = "1"; current.depositStroops = "10"; current.viewer = PREVIEW_WALLET.address;
  assert.match(ui.html(), /Room A/); assert.doesNotMatch(ui.html(), /Changed room/);
  ui.click("Confirm deposit and join"); assert.deepEqual({ ...ui.joins[0].invitation }, expected());
});

test("double click is blocked synchronously, and Back or change-invite cannot cancel a pending join", async () => {
  const ui = setup(); await resolvedReview(ui); const confirm = ui.control("Confirm deposit and join"); const change = ui.control("Use another invite"); const back = ui.control("Back to arisan rooms");
  invoke(confirm); invoke(confirm); assert.equal(ui.joins.length, 1);
  assert.equal(ui.control("Confirm deposit and join").props.disabled, true); assert.equal(ui.control("Use another invite").props.disabled, true); assert.equal(ui.control("Back to arisan rooms").props.disabled, true);
  invoke(change); invoke(back); assert.equal(ui.calls.backs, 0); assert.match(ui.html(), /Room A/);
  ui.joins[0].result.resolve({ ok: true, id: 11 }); await flush(); invoke(confirm);
  assert.equal(ui.joins.length, 1); assert.deepEqual(ui.calls.navigation, ["/arisan/11"]); assert.equal(ui.calls.success.length, 1);
});

test("current time blocks confirmation when the invitation expires after review, including a stale enabled handler", async () => {
  const ui = setup(); await resolvedReview(ui, "FAM234", room(11, { joinDeadline: initialNow / 1000 + 1 }));
  const staleConfirm = ui.control("Confirm deposit and join"); assert.equal(staleConfirm.props.disabled, false);
  ui.advance(1000, false); invoke(staleConfirm);
  assert.equal(ui.joins.length, 0); assert.match(ui.html(), /role="alert"/); assert.match(ui.html(), /invitation has expired/);
  assert.equal(ui.control("Confirm deposit and join").props.disabled, true);
});

test("the review deadline timer disables confirmation without another user action", async () => {
  const ui = setup(); await resolvedReview(ui, "FAM234", room(11, { joinDeadline: initialNow / 1000 + 1 }));
  assert.equal(ui.control("Confirm deposit and join").props.disabled, false); ui.advance(1000);
  assert.equal(ui.control("Confirm deposit and join").props.disabled, true); assert.equal(ui.joins.length, 0);
});

test("unmounted lookups and joins cannot update state, navigate, or announce success", async () => {
  const resolving = setup(); resolving.code("FAM234"); resolving.click("Review invitation"); resolving.cleanup();
  resolving.lookups[0].result.resolve({ ok: true, code: "FAM234", id: 11 }); await flush(); assert.equal(resolving.rooms.length, 0); assert.equal(resolving.calls.afterUnmountUpdates, 0);
  const loading = setup(); loading.code("FAM234"); loading.click("Review invitation"); loading.lookups[0].result.resolve({ ok: true, code: "FAM234", id: 11 }); await flush(); loading.cleanup();
  loading.rooms[0].result.resolve(room()); await flush(); assert.equal(loading.calls.afterUnmountUpdates, 0);
  const joining = setup(); await resolvedReview(joining); joining.click("Confirm deposit and join"); joining.cleanup();
  joining.joins[0].result.resolve({ ok: true, id: 11 }); await flush(); assert.deepEqual(joining.calls.navigation, []); assert.deepEqual(joining.calls.success, []); assert.equal(joining.calls.afterUnmountUpdates, 0);
});

const invalidTerms: { reason: string; value: Partial<Room> }[] = [
  { reason: "missing exact share", value: { shareStroops: undefined } },
  { reason: "missing exact deposit", value: { depositStroops: undefined } },
  { reason: "deposit mismatch", value: { depositStroops: "1" } },
  { reason: "missing wallet", value: { viewer: undefined } },
  { reason: "nullable public viewer", value: { viewer: null } },
  { reason: "unverified wallet", value: { viewer: "unverified" } },
];
for (const invalid of invalidTerms) {
  test(`live review refuses unverified terms: ${invalid.reason}`, async () => {
    const ui = setup(); await resolvedReview(ui, "FAM234", room(11, invalid.value));
    assert.match(ui.html(), /Room terms could not be verified/); assert.doesNotMatch(ui.html(), /Confirm deposit and join/); assert.equal(ui.joins.length, 0);
  });
}

test("a resolver code or room identity mismatch never produces a confirmable review", async () => {
  const codeMismatch = setup(); codeMismatch.code("FAM234"); codeMismatch.click("Review invitation"); codeMismatch.lookups[0].result.resolve({ ok: true, code: "BCD567", id: 11 }); await flush();
  assert.match(codeMismatch.html(), /invitation changed/); assert.equal(codeMismatch.rooms.length, 0);
  const roomMismatch = setup(); roomMismatch.code("FAM234"); roomMismatch.click("Review invitation"); roomMismatch.lookups[0].result.resolve({ ok: true, code: "FAM234", id: 11 }); await flush(); roomMismatch.rooms[0].result.resolve(room(22)); await flush();
  assert.match(roomMismatch.html(), /Room terms could not load/); assert.equal(roomMismatch.joins.length, 0);
});

test("closed, full, expired, and already joined rooms cannot invoke the join mutation", async () => {
  for (const invalid of [{ status: "Active" }, { memberCount: 5 }, { joinDeadline: initialNow / 1000 }] as Partial<Room>[]) {
    const ui = setup(); await resolvedReview(ui, "FAM234", room(11, invalid)); const confirm = ui.control("Confirm deposit and join"); assert.equal(confirm.props.disabled, true); invoke(confirm); assert.equal(ui.joins.length, 0);
  }
  const member = setup(); await resolvedReview(member, "FAM234", room(11, { isMember: true }));
  assert.doesNotMatch(member.html(), /Confirm deposit and join/); member.click("View your room"); assert.deepEqual(member.calls.navigation, ["/arisan/11"]); assert.equal(member.joins.length, 0);
});

test("a failed join retains its reviewed invitation and permits only a definitive retry", async () => {
  const ui = setup(); await resolvedReview(ui); ui.click("Confirm deposit and join"); ui.joins[0].result.resolve({ ok: false, error: "Definitive join failure" }); await flush();
  assert.match(ui.html(), /Room A|Definitive join failure/); assert.deepEqual(ui.calls.navigation, []); assert.equal(ui.control("Confirm deposit and join").props.disabled, false);
  ui.setLocked(true); const confirm = ui.control("Confirm deposit and join"); assert.equal(confirm.props.disabled, true); invoke(confirm); assert.equal(ui.joins.length, 1);
});
