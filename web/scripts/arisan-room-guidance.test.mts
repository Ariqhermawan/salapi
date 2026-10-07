import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { DICTS } from "../lib/i18n/dictionaries.ts";
import { arisanDrawRecovery, arisanRoomCopy, arisanViewerIdentity, arisanViewerRole } from "../lib/arisan-room-guidance.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import * as memberIdentity from "../lib/arisan-member-identity.ts";

const now = 1_800_000_000;
const room = (overrides: Record<string, unknown> = {}) => ({ ready: true, id: 1, viewer: PREVIEW_WALLET.address, viewerIdentity: "personal", name: "QA room", host: PREVIEW_WALLET.address, hostLabel: "You", cadence: "Weekly", cadenceSecs: 60, memberTarget: 3, memberCount: 3, sharePesos: 100, shareStroops: "10000000", depositStroops: "30000000", potPesos: 300, status: "Active", round: 1, drawPhase: "Reveal", firstKocok: now - 60, joinDeadline: now - 90, commitAt: now - 30, revealAt: now + 10, nextActionAt: now + 10, commitCount: 3, revealCount: 0, eligibleCount: 3, seats: [{ addr: PREVIEW_WALLET.address, label: "You", isYou: true, won: false, committed: true, revealed: false }], winners: [], isHost: true, isMember: true, canUseDemoFriends: false, canCommit: false, canReveal: true, canFinalize: false, ...overrides });
type Room = ReturnType<typeof room>;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
type Effect = { callback: () => void | (() => void); deps: readonly unknown[]; cleanup?: () => void };
type Element = React.ReactElement<Record<string, unknown>>;
const source = ts.transpileModule(readFileSync(new URL("../components/screens/ArisanRoomScreen.tsx", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

// Actual component lifecycle and handlers with deferred read/action boundaries.
// These tests cannot sign, reach RPC, or submit Testnet transactions.
function setup() {
  const cells: unknown[] = [];
  const effects = new Map<number, Effect>();
  const scheduled = new Map<number, Effect>();
  const timers: (() => void)[] = [];
  const reads: ReturnType<typeof deferred<Room | { ready: false }>>[] = [];
  const actions: { name: string; result: ReturnType<typeof deferred<{ ok: boolean; error?: string; errorKey?: string; pending?: boolean }>> }[] = [];
  let cursor = 0;
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (value: unknown) => { cells[index] = typeof value === "function" ? value(cells[index]) : value; }];
    },
    useRef(initial: unknown) { const index = cursor++; return cells[index] ?? (cells[index] = { current: initial }); },
    useEffect(callback: Effect["callback"], deps: readonly unknown[]) {
      const index = cursor++; const old = effects.get(index);
      if (!old || old.deps.length !== deps.length || deps.some((value, i) => !Object.is(value, old.deps[i]))) scheduled.set(index, { callback, deps });
    },
    useTransition() { return [false, (callback: () => Promise<unknown>) => { void callback(); }]; },
  };
  const Container = ({ children }: { children: React.ReactNode }) => React.createElement("div", null, children);
  const Button = ({ children, onClick, disabled, ariaLabel }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; ariaLabel?: string }) => React.createElement("button", { onClick, disabled, "aria-label": ariaLabel }, children);
  const exports = {} as { default: (props: { roomId: number }) => React.ReactElement };
  const t = (key: string) => key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], DICTS.en) ?? key;
  runInNewContext(source, { exports, Date: { now: () => now * 1000 },
    setTimeout(callback: () => void) { timers.push(callback); return timers.length; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "next/image") return { __esModule: true, default: (props: Record<string, unknown>) => React.createElement("img", props) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "en", locale: "en", t }) };
      if (name === "@/components/ui/kit") return { T: {}, Ico: new Proxy({}, { get: () => () => null }), AppBar: ({ leading, title }: { leading: React.ReactNode; title: string }) => React.createElement("header", null, leading, title), IconButton: Button, Btn: Button, Chip: Container, Avatar: () => null, PoweredByStellar: () => null };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => {} };
      if (name === "@/lib/arisan-member-identity") return memberIdentity;
      if (name === "@/lib/ui/useArisanMemberIdentities") return { useArisanMemberIdentities: () => new Map() };
      if (name === "@/components/ArisanMemberIdentity") return { ArisanMemberAvatar: () => null,
        ArisanMemberIdentity: (props: { address: string; previewLabel?: string; children?: React.ReactNode }) => React.createElement("div", null, memberIdentity.arisanMemberName(props.address, undefined, props.previewLabel), props.children) };
      if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ locked: false, run: (action: () => Promise<unknown>) => action() }) };
      if (name === "@/components/ui/SubmissionStatusPanel") return { __esModule: true, default: () => null };
      if (name === "@/components/ui/SuccessMotion") return { __esModule: true, default: Container };
      if (name === "@/lib/local-preview") return { isLocalPreview: false, PREVIEW_WALLET };
      if (name === "@/lib/i18n/revamp-account") return { accountCopy: () => ({ back: "Back" }) };
      if (name === "@/lib/arisan-room-guidance") return { arisanDrawRecovery, arisanRoomCopy, arisanViewerIdentity, arisanViewerRole };
      if (name === "@/lib/money") return { pesosToStroopsExact: () => 0n };
      if (name === "@/lib/ui/currency") return { formatLocal: (amount: number) => `PHP ${amount}` };
      if (name === "./arisan-preview") return {};
      if (name === "@/app/actions") return new Proxy({}, { get: (_, method: string) => () => {
        if (method === "arisanRoomState") { const result = deferred<Room | { ready: false }>(); reads.push(result); return result.promise; }
        const result = deferred<{ ok: boolean; error?: string; errorKey?: string; pending?: boolean }>(); actions.push({ name: method, result }); return result.promise;
      } });
      if (name.endsWith(".module.css")) return { __esModule: true, default: {} };
      throw Error(`Unexpected room dependency ${name}`);
    },
  });
  function render() {
    cursor = 0; const tree = exports.default({ roomId: 1 });
    const pending = [...scheduled.entries()]; scheduled.clear();
    for (const [index, effect] of pending) { effects.get(index)?.cleanup?.(); effects.set(index, { ...effect, cleanup: effect.callback() || undefined }); }
    return tree;
  }
  function content(value: unknown): string {
    if (typeof value === "string" || typeof value === "number") return String(value);
    if (Array.isArray(value)) return value.map(content).join("");
    return React.isValidElement<Record<string, unknown>>(value) ? content(value.props.children) : "";
  }
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!React.isValidElement<Record<string, unknown>>(value)) return [];
    if (typeof value.type === "function") return nodes((value.type as (props: Record<string, unknown>) => unknown)(value.props));
    return [value, ...nodes(value.props.children)];
  }
  render(); for (const callback of timers.splice(0)) callback();
  return { reads, actions, html: () => renderToStaticMarkup(render()),
    control(label: string) { const node = nodes(render()).find(node => node.type === "button" && content(node) === label); assert.ok(node, `Missing room control ${label}`); return node; },
    click(label: string) { const control = this.control(label); assert.equal(control.props.disabled, false); (control.props.onClick as () => void)(); },
  };
}
async function loaded(value = room()) { const ui = setup(); ui.reads[0].resolve(value); await flush(); ui.html(); return ui; }

test("late reveal error refreshes the authoritative phase, shows payout guidance, and never resubmits", async () => {
  const ui = await loaded(); ui.click(DICTS.en.arisan.draw.revealCta);
  assert.equal(ui.actions.length, 1); assert.equal(ui.actions[0].name, "arisanReveal");
  ui.actions[0].result.resolve({ ok: false, errorKey: "arisan.somethingWrong" }); await flush();
  assert.equal(ui.reads.length, 2);
  ui.reads[1].resolve(room({ drawPhase: "Finalizable", canReveal: false, canFinalize: true, revealAt: now - 1 })); await flush();
  assert.match(ui.html(), /This transaction was not confirmed/); assert.match(ui.html(), /reveal window has closed/); assert.match(ui.html(), /ready for payout/);
  assert.doesNotMatch(ui.html(), /Something went wrong/); assert.equal(ui.actions.length, 1);
});

test("unrelated reveal failure in the same authoritative phase preserves the error without deadline speculation", async () => {
  const ui = await loaded(); ui.click(DICTS.en.arisan.draw.revealCta);
  ui.actions[0].result.resolve({ ok: false, error: "Authentication is unavailable." }); await flush();
  // A stale browser deadline does not override the phase returned by the server.
  ui.reads[1].resolve(room({ revealAt: now - 1 })); await flush();
  assert.match(ui.html(), /Authentication is unavailable/); assert.doesNotMatch(ui.html(), /window has closed|ready for payout/); assert.equal(ui.actions.length, 1);
});

test("a pending reveal does not acquire a definitive deadline explanation from a refreshed phase", async () => {
  const ui = await loaded(); ui.click(DICTS.en.arisan.draw.revealCta);
  ui.actions[0].result.resolve({ ok: false, pending: true, error: "Status unknown." }); await flush();
  ui.reads[1].resolve(room({ drawPhase: "Finalizable", canFinalize: true })); await flush();
  assert.match(ui.html(), /Status unknown/); assert.doesNotMatch(ui.html(), /window has closed/); assert.equal(ui.actions.length, 1);
});

test("shared demo-host identity is visibly a guest and never acquires configured-friend controls", async () => {
  const ui = await loaded(room({ viewerIdentity: "demo", canReveal: false }));
  assert.match(ui.html(), /Guest view · shared demo host/); assert.match(ui.html(), /not a verified personal membership/); assert.match(ui.html(), /Shared demo wallet/);
  assert.doesNotMatch(ui.html(), /Testnet demo controls|Your saved wallet is the host/); assert.equal(ui.actions.length, 0);
});

test("unverified public identity cannot present the shared demo wallet as personal membership", async () => {
  const ui = await loaded(room({ viewerIdentity: "unverified", isHost: false, isMember: false, canReveal: false, seats: [] }));
  assert.match(ui.html(), /Public view · personal wallet not verified/); assert.match(ui.html(), /shared Testnet demo wallet does not establish your personal membership/);
  assert.doesNotMatch(ui.html(), /Your saved wallet is the host|Your saved wallet is a member|Testnet demo controls/);
});

test("completion copy is scoped to this room in every supported language and has no global balance claim", async () => {
  const ui = await loaded(room({ status: "Done", drawPhase: null, round: 4, canReveal: false }));
  assert.match(ui.html(), /This room&#x27;s cycle is complete/); assert.match(ui.html(), /Each member received one payout/);
  for (const dict of Object.values(DICTS)) assert.doesNotMatch(dict.arisan.room.doneBody, /contract|kontrata|kontrak|hợp đồng/i);
});

test("draw recovery only uses a matching fresh room and handles advanced rounds without inventing a deadline cause", () => {
  const before = { id: 1, round: 1, status: "Active", drawPhase: "Reveal" };
  assert.equal(arisanDrawRecovery("reveal", before, null, "en"), null);
  assert.equal(arisanDrawRecovery("reveal", before, { ...before, id: 2, drawPhase: "Finalizable" }, "en"), null);
  assert.equal(arisanDrawRecovery("postpone", before, { ...before, drawPhase: "Finalizable" }, "en"), null);
  assert.match(arisanDrawRecovery("reveal", before, { ...before, round: 2 }, "en")!, /another round/);
  assert.match(arisanDrawRecovery("commit", { ...before, drawPhase: "Commit" }, { ...before, drawPhase: "Reveal" }, "en")!, /commit window has closed/);
});

test("personal, shared-demo, unverified and local-example roles stay distinct", () => {
  assert.equal(arisanViewerRole({ isHost: true, isMember: true, viewerIdentity: "personal" }, false, "en"), "Your saved wallet is the host");
  assert.equal(arisanViewerRole({ isHost: false, isMember: true, viewerIdentity: "demo" }, false, "en"), "Guest view · shared demo member");
  assert.equal(arisanViewerRole({ isHost: true, isMember: true }, false, "en"), "Public view · personal wallet not verified");
  assert.equal(arisanViewerRole({ isHost: true, isMember: true, viewerIdentity: "personal" }, true, "en"), "Local example host");
});
