import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as revampMoney from "../lib/i18n/revamp-money.ts";
import * as money from "../lib/money.ts";
import { formatLocal } from "../lib/ui/currency.ts";
import type { LocalPaluwaganState, LocalPaluwaganAction } from "../lib/local-preview-paluwagan.ts";

type Element = { type: string; props: Record<string, unknown> };
type Result = { ok: true; state: LocalPaluwaganState } | { ok: false; error: string };
const key = "salapi.preview.paluwagan:v1";
const share = money.pesosToStroopsExact("84.24")!;
const fullPot = share * 3n;
const compile = (path: string, jsx = false) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
}).outputText;
const helperCode = compile("../lib/local-preview-paluwagan.ts");
const componentCode = compile("../components/screens/PaluwaganScreen.tsx", true);

function storageSetup() {
  const memory = new Map<string, string>();
  const calls = { reads: 0, writes: 0, removes: 0 };
  const control = { readThrows: false, writeThrows: false, readMismatchOnce: false, writeThenThrowOnce: false };
  const storage = {
    getItem(name: string) { calls.reads++; if (control.readThrows) throw Error("Isolated read failure");
      if (control.readMismatchOnce && calls.writes > 0) { control.readMismatchOnce = false; return "isolated read-back mismatch"; }
      return memory.get(name) ?? null; },
    setItem(name: string, value: string) { calls.writes++; if (control.writeThrows) throw Error("Isolated quota failure");
      memory.set(name, value); if (control.writeThenThrowOnce) { control.writeThenThrowOnce = false; throw Error("Isolated accepted partial write"); } },
    removeItem(name: string) { calls.removes++; memory.delete(name); },
  };
  return { memory, calls, control, storage };
}
type Store = ReturnType<typeof storageSetup>;
function helper(store: Store, preview = true) {
  const api = {} as {
    readLocalPaluwagan(storage?: Store["storage"]): Result;
    applyLocalPaluwagan(action: LocalPaluwaganAction, revision: number, storage?: Store["storage"]): Result;
    localPaluwaganSummary(state: LocalPaluwaganState): { completed: boolean; allPaid: boolean; recipientLabel: string; potStroops: string; fullPotStroops: string };
    localPaluwaganDisplayPesos(stroops: string): number;
    LOCAL_PALUWAGAN_ROSTER: { id: string; label: string }[];
  };
  runInNewContext(helperCode, { exports: api, window: { sessionStorage: store.storage },
    require(name: string) {
      if (name === "./local-preview") return { isLocalPreview: preview };
      if (name === "./money") return money;
      throw Error(`Unstubbed helper dependency: ${name}`);
    }, fetch() { throw Error("Network forbidden in local preview tests"); },
  });
  return api;
}
function state(result: Result): LocalPaluwaganState { assert.equal(result.ok, true); return (result as { ok: true; state: LocalPaluwaganState }).state; }
const nodes = (value: unknown): Element[] => {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
};
const text = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
};

// Executes the real component and handlers with isolated hooks, exact helper
// code and in-memory storage. Never opens a browser or calls a real server.
async function screenSetup(options: { store?: Store; preview?: boolean } = {}) {
  const store = options.store ?? storageSetup();
  const preview = options.preview ?? true;
  const api = helper(store, preview);
  const slots: unknown[] = [];
  let cursor = 0;
  let effectRan = false;
  const effects: (() => void)[] = [];
  const transitions: Promise<unknown>[] = [];
  const calls = { reads: 0, pay: 0, friends: 0, collect: 0, guards: 0, navigation: 0 };
  const paluwaganModule = {} as { default(): Element };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type: String(type), props });
  const icons = new Proxy({}, { get: () => () => null });
  const realFixture = { ready: true, round: 0, cycleRound: 1, sharePesos: 84.24, potPesos: 252.72, sharePeso: "₱84.24", potPeso: "₱252.72", allPaid: false,
    recipientLabel: "Maria", seats: [{ addr: "local-you", label: "You", paid: false, isRecipient: false }, { addr: "local-maria", label: "Maria", paid: false, isRecipient: true }, { addr: "local-jose", label: "Jose", paid: false, isRecipient: false }] };
  const checkLive = () => assert.equal(preview, false, "Local preview must not call any server action");
  runInNewContext(componentCode, { exports: paluwaganModule, Promise, console, setTimeout: () => 1,
    fetch() { throw Error("Network forbidden"); },
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/lib/i18n/revamp-money") return revampMoney;
      if (name === "react") return {
        useState(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
          return [slots[i], (value: unknown) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }]; },
        useRef(initial: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
        useEffect(effect: () => void) { if (!effectRan) effects.push(effect); },
        useTransition: () => [false, (fn: () => Promise<unknown>) => transitions.push(fn())],
      };
      if (name === "next/navigation") return { useRouter: () => ({ push() { calls.navigation++; } }) };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => { calls.navigation++; } };
      if (name === "@/lib/ui/currency") return { formatLocal };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET: { address: "local-you" } };
      if (name === "@/lib/local-preview-paluwagan") return api;
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "tl", t: (key: string) => key }) };
      if (name === "@/components/ui/kit") return { T: {}, Ico: icons, AppBar: "AppBar", IconButton: "IconButton", Card: "Card", Btn: "Btn", Chip: "Chip", Avatar: "Avatar", Peso: "Peso", PoweredByStellar: "PoweredByStellar" };
      if (name === "@/components/ui/SuccessMotion") return { default: "SuccessMotion" };
      if (name === "@/components/ui/SubmissionStatusPanel") return { default: "SubmissionStatusPanel" };
      if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ state: { kind: "clear" }, locked: false,
        async run(fn: () => Promise<unknown>) { checkLive(); calls.guards++; return fn(); } }) };
      if (name === "@/app/actions") return {
        async paluwaganState() { checkLive(); calls.reads++; return realFixture; },
        async paluwaganPayMine() { checkLive(); calls.pay++; return { ok: true, link: "isolated-testnet-receipt" }; },
        async paluwaganFriendsPay() { checkLive(); calls.friends++; return { ok: true }; },
        async paluwaganCollect() { checkLive(); calls.collect++; return { ok: true, link: "isolated-testnet-receipt" }; },
      };
      throw Error(`Unstubbed UI dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; return paluwaganModule.default(); };
  let tree = render();
  for (const effect of effects.splice(0)) effect();
  effectRan = true;
  async function flush() { while (transitions.length) await Promise.all(transitions.splice(0)); await new Promise(resolve => setImmediate(resolve)); tree = render(); }
  await flush();
  const button = (label: string) => nodes(tree).find(node => node.type === "Btn" && text(node).includes(label));
  async function click(label: string) { const node = button(label); assert.ok(node, `Missing ${label}; visible buttons: ${nodes(tree).filter(item => item.type === "Btn").map(text).join(" | ")}`); assert.notEqual(node.props.disabled, true, `${label} disabled`);
    (node.props.onClick as () => void)(); await flush(); }
  return { store, api, calls, click, button, flush, render, get tree() { return tree; } };
}

test("example ledger uses canonical integer units and reads do not persist fictional deposits", () => {
  const store = storageSetup(); const api = helper(store); const initial = state(api.readLocalPaluwagan());
  assert.equal(initial.shareStroops, share.toString()); assert.equal(share, 129600000n);
  assert.deepEqual(Array.from(initial.paid), [true, true, false]); assert.equal(store.calls.writes, 0);
  assert.equal(api.localPaluwaganSummary(initial).potStroops, (share * 2n).toString());
  assert.equal(api.localPaluwaganDisplayPesos(fullPot.toString()), 252.72);
  assert.doesNotMatch(JSON.stringify(initial), /wallet|address|secret|recipientHandle|hash/i);
});

test("friends pay only unpaid friend seats and duplicate/stale confirmations cannot add another share", () => {
  const store = storageSetup(); const api = helper(store);
  assert.equal(api.applyLocalPaluwagan("pay-mine", 0).ok, false);
  const next = state(api.applyLocalPaluwagan("friends-pay", 0));
  assert.equal(next.revision, 1); assert.equal(api.localPaluwaganSummary(next).potStroops, fullPot.toString());
  const raw = store.memory.get(key); assert.equal(api.applyLocalPaluwagan("friends-pay", 0).ok, false);
  assert.equal(api.applyLocalPaluwagan("friends-pay", 1).ok, false); assert.equal(store.memory.get(key), raw);
});

test("finite rotation pays each fixed-roster member exactly once and stops after round three", () => {
  const store = storageSetup(); const api = helper(store); let current = state(api.applyLocalPaluwagan("friends-pay", 0));
  current = state(api.applyLocalPaluwagan("collect", current.revision));
  for (let round = 1; round < 3; round++) {
    assert.equal(api.applyLocalPaluwagan("collect", current.revision).ok, false);
    current = state(api.applyLocalPaluwagan("pay-mine", current.revision));
    current = state(api.applyLocalPaluwagan("friends-pay", current.revision));
    current = state(api.applyLocalPaluwagan("collect", current.revision));
  }
  assert.equal(current.round, 3); assert.equal(current.revision, 8);
  assert.deepEqual(Array.from(current.payouts, payout => payout.recipientId), ["maria", "jose", "you"]);
  assert.ok(current.payouts.every(payout => payout.amountStroops === fullPot.toString()));
  assert.equal(api.localPaluwaganSummary(current).completed, true);
  assert.equal(api.localPaluwaganSummary(current).potStroops, "0");
  for (const action of ["pay-mine", "friends-pay", "collect"] as const) assert.equal(api.applyLocalPaluwagan(action, current.revision).ok, false);
  assert.equal(state(helper(store).readLocalPaluwagan()).round, 3, "Reload must not automatically restart the example");
});

test("malformed, unreachable, changed-money and oversized snapshots never become valid history", () => {
  const store = storageSetup(); const api = helper(store); const initial = state(api.readLocalPaluwagan());
  for (const raw of ["invalid", "x".repeat(2049), JSON.stringify({ ...initial, shareStroops: "1" }),
    JSON.stringify({ ...initial, round: 1, revision: 0, payouts: [{ round: 1, recipientId: "maria", amountStroops: fullPot.toString() }] }),
    JSON.stringify({ ...initial, paid: [false, true, false] })]) {
    store.memory.set(key, raw); assert.equal(api.readLocalPaluwagan().ok, false); assert.equal(api.applyLocalPaluwagan("collect", 0).ok, false);
    assert.equal(store.memory.get(key), raw); assert.equal(store.calls.writes, 0);
  }
});

test("failed first writes and accepted partial writes preserve the exact previous record", () => {
  for (const mode of ["throw", "accepted-throw", "readback"] as const) {
    const store = storageSetup(); const api = helper(store);
    const previous = JSON.stringify(state(api.readLocalPaluwagan()), null, 2); store.memory.set(key, previous);
    if (mode === "throw") store.control.writeThrows = true;
    if (mode === "accepted-throw") store.control.writeThenThrowOnce = true;
    if (mode === "readback") store.control.readMismatchOnce = true;
    const result = api.applyLocalPaluwagan("friends-pay", 0); assert.equal(result.ok, false, mode);
    assert.equal(store.memory.get(key), previous, `${mode} must restore exact prior raw bytes`);
  }
  const store = storageSetup(); const api = helper(store); store.control.writeThenThrowOnce = true;
  assert.equal(api.applyLocalPaluwagan("friends-pay", 0).ok, false); assert.equal(store.memory.has(key), false);
});

test("unavailable storage fails closed and nonpreview helpers never read or write a session", () => {
  const store = storageSetup(); const api = helper(store); store.control.readThrows = true;
  assert.equal(api.readLocalPaluwagan().ok, false); assert.equal(api.applyLocalPaluwagan("friends-pay", 0).ok, false); assert.equal(store.calls.writes, 0);
  const liveStore = storageSetup(); const live = helper(liveStore, false);
  assert.equal(live.readLocalPaluwagan().ok, false); assert.equal(live.applyLocalPaluwagan("friends-pay", 0).ok, false);
  assert.deepEqual(liveStore.calls, { reads: 0, writes: 0, removes: 0 });
});

test("actual preview UI requires an explicit local review before any write, including cancel", async () => {
  const screen = await screenSetup(); assert.equal(screen.store.calls.writes, 0);
  assert.match(text(screen.tree), /Browser-only example.*No real deposits/);
  await screen.click("Review friends' example shares"); assert.equal(screen.store.calls.writes, 0);
  assert.ok(nodes(screen.tree).some(node => node.props["aria-label"] === "Review local Paluwagan action"));
  assert.match(text(screen.tree), /Illustrative amount.*₱84.24.*Unpaid friends only/);
  await screen.click("Cancel"); assert.equal(screen.store.calls.writes, 0);
  assert.equal(screen.button("Confirm local simulation"), undefined); assert.deepEqual(screen.calls, { reads: 0, pay: 0, friends: 0, collect: 0, guards: 0, navigation: 0 });
});

test("retained actual confirm handler cannot double-pay and success follows checked session persistence", async () => {
  const screen = await screenSetup(); await screen.click("Review friends' example shares");
  const confirm = screen.button("Confirm local simulation")!.props.onClick as () => void;
  confirm(); confirm(); await screen.flush();
  assert.equal(screen.store.calls.writes, 1); assert.equal(state(screen.api.readLocalPaluwagan()).revision, 1);
  assert.ok(nodes(screen.tree).some(node => node.type === "SuccessMotion"));
  assert.match(text(screen.tree), /Local simulation only.*No tokens moved.*no on-chain receipt/);
  assert.ok(screen.button("Review example payout")); assert.equal(screen.calls.collect, 0);
});

test("actual payout review saves recipient/round history, advances unpaid shares and survives remount", async () => {
  const screen = await screenSetup(); await screen.click("Review friends' example shares"); await screen.click("Confirm local simulation");
  await screen.click("Review example payout"); assert.match(text(screen.tree), /Illustrative amount.*₱252.72.*Maria/);
  await screen.click("Confirm local simulation");
  assert.equal(state(screen.api.readLocalPaluwagan()).round, 1);
  assert.ok(screen.button("Review my example share")); assert.match(text(screen.tree), /Example payout history.*Round 1: Maria/);
  const reloaded = await screenSetup({ store: screen.store });
  assert.ok(reloaded.button("Review my example share")); assert.match(text(reloaded.tree), /Round 1: Maria/);
  assert.equal(nodes(reloaded.tree).some(node => node.type === "SuccessMotion"), false, "Reload is not a new confirmed operation");
});

test("actual UI blocks financial-like retries after failed save until local state is reloaded", async () => {
  const screen = await screenSetup(); await screen.click("Review friends' example shares"); screen.store.control.writeThrows = true;
  await screen.click("Confirm local simulation");
  assert.ok(nodes(screen.tree).some(node => node.props.role === "alert"));
  assert.equal(nodes(screen.tree).some(node => node.type === "SuccessMotion"), false);
  assert.equal(screen.button("Confirm local simulation"), undefined); assert.equal(screen.button("Review friends' example shares")?.props.disabled, true);
  assert.equal(screen.store.memory.has(key), false); screen.store.control.writeThrows = false;
  await screen.click("Reload local circle"); assert.equal(screen.button("Review friends' example shares")?.props.disabled, false);
  await screen.click("Review friends' example shares"); await screen.click("Confirm local simulation");
  assert.equal(state(screen.api.readLocalPaluwagan()).revision, 1); assert.equal(screen.calls.guards, 0);
});

test("actual UI rejects a review whose saved revision changed and demands a new review", async () => {
  const screen = await screenSetup(); await screen.click("Review friends' example shares");
  state(screen.api.applyLocalPaluwagan("friends-pay", 0));
  await screen.click("Confirm local simulation"); assert.match(text(screen.tree), /changed after review/);
  assert.equal(nodes(screen.tree).some(node => node.type === "SuccessMotion"), false);
  assert.equal(screen.button("Review friends' example shares")?.props.disabled, true);
  await screen.click("Reload local circle"); assert.ok(screen.button("Review example payout"));
  assert.equal(state(screen.api.readLocalPaluwagan()).revision, 1);
});

test("actual UI completes all three example rounds without automatic fourth-round or wallet writes", async () => {
  const screen = await screenSetup(); await screen.click("Review friends' example shares"); await screen.click("Confirm local simulation");
  await screen.click("Review example payout"); await screen.click("Confirm local simulation");
  for (let round = 1; round < 3; round++) {
    await screen.click("Review my example share"); await screen.click("Confirm local simulation");
    await screen.click("Review friends' example shares"); await screen.click("Confirm local simulation");
    await screen.click("Review example payout"); await screen.click("Confirm local simulation");
  }
  assert.match(text(screen.tree), /Example cycle complete.*There is no fourth round/);
  assert.equal(screen.button("Review my example share"), undefined); assert.equal(screen.button("Review example payout"), undefined);
  assert.deepEqual(Array.from(state(screen.api.readLocalPaluwagan()).payouts, payout => payout.recipientId), ["maria", "jose", "you"]);
  assert.deepEqual([...screen.store.memory.keys()], [key]); assert.equal(screen.calls.pay + screen.calls.friends + screen.calls.collect + screen.calls.guards + screen.calls.reads, 0);
});

test("actual nonpreview UI retains original live action and shared guard, not the local state helper", async () => {
  const screen = await screenSetup({ preview: false }); assert.equal(screen.calls.reads, 1);
  await screen.click("paluwagan.payShare"); assert.equal(screen.calls.pay, 1); assert.equal(screen.calls.guards, 1);
  assert.equal(screen.calls.reads, 2); assert.equal(screen.store.calls.reads + screen.store.calls.writes, 0);
  assert.equal(screen.button("Confirm local simulation"), undefined);
});

test("Paluwagan header icons have accessible names and retain navigation actions", async () => {
  for (const preview of [true, false]) {
    const screen = await screenSetup({ preview });
    const header = nodes(screen.tree).find(node => node.type === "AppBar");
    assert.ok(header);
    const back = header.props.leading as Element;
    const activity = header.props.trailing as Element;
    assert.equal(back.props.ariaLabel, "Back to Vaults");
    assert.equal(activity.props.ariaLabel, "View Activity");
    (back.props.onClick as () => void)();
    (activity.props.onClick as () => void)();
    assert.equal(screen.calls.navigation, 2);
  }
});
