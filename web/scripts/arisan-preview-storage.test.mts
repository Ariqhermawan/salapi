import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { CURRENCY, formatLocal, formatLocalAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import { moneyInputToStroops, pesosToStroopsExact } from "../lib/money.ts";
import * as accountCopy from "../lib/i18n/revamp-account.ts";
import * as arisanRoomGuidance from "../lib/arisan-room-guidance.ts";

type Element = { type: string; props: Record<string, unknown> };
type Api = { readPreviewArisanRoom(id: number, checked?: boolean): unknown; savePreviewArisanRoom(room: unknown): boolean; clearPreviewArisanRoom(id: number): boolean; commitPreviewArisanSession(changes: { key: string; value: string | null }[]): boolean; previewArisanRoomKey(id: number): string };
const compile = (path: string, jsx = false) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText;
const helperCode = compile("../components/screens/arisan-preview.ts");
const screens = ["ArisanCreateScreen", "ArisanJoinScreen", "ArisanRoomScreen"] as const;
const codes = Object.fromEntries(screens.map(name => [name, compile(`../components/screens/${name}.tsx`, true)]));
function nodes(value: unknown): Element[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object" || !("props" in value)) return []; const node = value as Element; return [node, ...nodes(node.props.children)]; }
function text(value: unknown): string { if (typeof value === "string" || typeof value === "number") return String(value); if (Array.isArray(value)) return value.map(text).join(""); return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : ""; }

function setup(screen: typeof screens[number], options: { roomId?: number; mode?: "get" | "set" | "drop"; data?: Map<string, string>; failKey?: string; preview?: boolean; serverRoom?: Record<string, unknown> } = {}) {
  const preview = options.preview ?? true;
  let serverRoom = options.serverRoom;
  const data = options.data ?? new Map<string, string>(); let mode = options.mode; let failKey = options.failKey;
  const state: unknown[] = []; let cursor = 0;
  const timers: (() => void)[] = []; const intervals: (() => void)[] = []; const transitions: Promise<unknown>[] = [];
  const effects = new Map<number, { deps: readonly unknown[]; cleanup?: () => void }>();
  const scheduled: { index: number; effect: () => void | (() => void); deps: readonly unknown[] }[] = [];
  const calls = { action: 0, network: 0, navigation: [] as string[], success: 0, operations: [] as string[] };
  const storage = {
    getItem(key: string) { if (mode === "get") throw new Error("Denied read"); return data.get(key) ?? null; },
    setItem(key: string, value: string) { if (mode === "set" || key === failKey) throw new Error("Denied write"); if (mode !== "drop") data.set(key, value); },
    removeItem(key: string) { if (mode === "set" || key === failKey) throw new Error("Denied removal"); data.delete(key); },
  };
  const helper = { exports: {} as Api };
  runInNewContext(helperCode, { exports: helper.exports, module: helper, sessionStorage: storage, window: {}, require(name: string) {
    if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET };
    if (name === "@/lib/money") return { pesosToStroopsExact };
    throw Error(`Unexpected preview helper import ${name}`);
  } });
  const jsx = (type: unknown, props: Record<string, unknown>): Element => typeof type === "function" ? type(props) : { type: String(type), props };
  const component = { exports: {} as { default(props: { roomId: number }): Element } };
  const forbidden = (kind: "network" | "action") => () => { calls[kind]++; throw new Error(`Unexpected ${kind}`); };
  const react = {
    useState(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = typeof value === "function" ? value() : value; return [state[index], (next: unknown) => { state[index] = typeof next === "function" ? next(state[index]) : next; }]; },
    useRef(value: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: value }; return state[index]; },
    useEffect(effect: () => void | (() => void), deps: readonly unknown[]) { const index = cursor++; const previous = effects.get(index); if (!previous || previous.deps.length !== deps.length || deps.some((value, i) => !Object.is(value, previous.deps[i]))) scheduled.push({ index, effect, deps }); }, useMemo: (fn: () => unknown) => fn(),
    useTransition: () => [false, (fn: () => Promise<unknown>) => transitions.push(fn())],
  };
  runInNewContext(codes[screen], { module: component, exports: component.exports, sessionStorage: storage, window: {}, fetch: forbidden("network"),
    setTimeout: (fn: () => void) => { timers.push(fn); return 1; }, clearTimeout: () => {}, setInterval: (fn: () => void) => { intervals.push(fn); return intervals.length; }, clearInterval: () => {},
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return react;
      if (name === "next/navigation") return { useRouter: () => ({ replace: (path: string) => calls.navigation.push(path), push: (path: string) => calls.navigation.push(path) }) };
      if (name === "next/image") return { default: "Image" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en", currency: "en", t: (key: string) => key }) };
      if (name === "@/lib/i18n/revamp-account") return accountCopy;
      if (name === "@/lib/arisan-room-guidance") return arisanRoomGuidance;
      if (name === "@/components/ui/kit") return { T: {}, Ico: new Proxy({}, { get: () => () => null }), AppBar: "AppBar", IconButton: "IconButton", Card: "Card", Btn: "Btn", Chip: "Chip", Avatar: "Avatar", PoweredByStellar: "PoweredByStellar" };
      if (name === "@/components/ui/SuccessMotion") return { default: (props: Record<string, unknown>) => jsx("SuccessMotion", { ...props, children: [props.title, props.children] }) };
      if (name === "@/lib/ui/success-feedback") return { announceSuccessMotion: () => { calls.success++; } };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => {} };
      if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ locked: false, state: { kind: "clear" }, notice: "", run: preview ? forbidden("action") : (action: () => Promise<unknown>) => action() }) };
      if (name === "@/components/ui/SubmissionStatusPanel") return { default: () => null };
      if (name === "@/lib/local-preview") return { isLocalPreview: preview, PREVIEW_WALLET };
      if (name === "@/lib/money") return { moneyInputToStroops, pesosToStroopsExact };
      if (name === "@/lib/ui/currency") return { CURRENCY, formatLocal, formatLocalAmount, pesoFromLocal };
      if (name === "./arisan-preview") return helper.exports;
      if (name === "@/app/actions") return new Proxy({}, { get: (_, method) => method === "arisanRoomState" && !preview ? async () => serverRoom : preview ? forbidden("action") : async () => { calls.action++; calls.operations.push(String(method)); return { ok: false, error: "Isolated fixture response. No transaction submitted." }; } });
      if (name.endsWith(".module.css")) return { default: {} };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const render = () => { cursor = 0; const next = component.exports.default({ roomId: options.roomId ?? 1 }); while (scheduled.length) { const { index, effect, deps } = scheduled.shift()!; effects.get(index)?.cleanup?.(); effects.set(index, { deps, cleanup: effect() || undefined }); } return next; };
  let tree = render(); while (timers.length) timers.shift()!(); tree = render();
  const settle = async () => { while (transitions.length) await Promise.all(transitions.splice(0)); for (let turn = 0; turn < 12; turn++) await Promise.resolve(); tree = render(); };
  const find = (predicate: (node: Element) => boolean) => { const node = nodes(tree).find(predicate); assert.ok(node, `Missing control in ${screen}: ${text(tree)}`); return node; };
  return { data, calls, api: helper.exports, get tree() { return tree; }, mode(next: typeof mode) { mode = next; }, fail(key?: string) { failKey = key; },
    settle, async refreshRoom(next: Record<string, unknown>) { serverRoom = next; intervals.at(-1)!(); await Promise.resolve(); await settle(); },
    change(label: string, value: string) { const node = find(node => node.type === "input" && node.props["aria-label"] === label); (node.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
    code(value: string) { const node = find(node => node.type === "input"); (node.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
    async click(label: string) { const node = find(node => ["Btn", "button"].includes(node.type) && text(node) === label); (node.props.onClick as () => void)(); await settle(); },
  };
}
function noExternal(ui: ReturnType<typeof setup>) { assert.equal(ui.calls.action, 0); assert.equal(ui.calls.network, 0); }
function errorOnly(ui: ReturnType<typeof setup>) { assert.ok(nodes(ui.tree).some(node => node.props.role === "alert" && /Browser storage/.test(text(node)))); assert.equal(ui.calls.navigation.length, 0); assert.equal(ui.calls.success, 0); assert.ok(!nodes(ui.tree).some(node => node.type === "SuccessMotion")); noExternal(ui); }

for (const mode of ["get", "set", "drop"] as const) {
  test(`create ${mode}: real review/confirm refuses navigation and displays storage error`, async () => {
    const ui = setup("ArisanCreateScreen", { mode }); ui.change("arisan.create.nameLabel", "Storage rehearsal"); ui.change("arisan.create.shareLabel", "10"); await ui.click("Review room terms"); await ui.click("Create local example room"); errorOnly(ui);
  });
  test(`join ${mode}: real invitation/review refuses saved-success and navigation`, async () => {
    const ui = setup("ArisanJoinScreen", { mode }); ui.code("FAM234"); await ui.click("Review invitation"); await ui.click("Join local example"); errorOnly(ui);
  });
  test(`room ${mode}: initial restore is tolerant, mutation is checked and has no success motion`, async () => {
    const ui = setup("ArisanRoomScreen", { mode }); assert.ok(nodes(ui.tree).some(node => node.type === "AppBar" && node.props.title === "Family arisan")); await ui.click("arisan.room.startCta"); errorOnly(ui); assert.match(text(ui.tree), /Everyone is funded/);
  });
}

test("successful local create and join are saved/read-back before navigation, never server submitted", async () => {
  const create = setup("ArisanCreateScreen"); create.change("arisan.create.nameLabel", "Checked room"); create.change("arisan.create.shareLabel", "10"); await create.click("Review room terms"); await create.click("Create local example room"); assert.deepEqual(create.calls.navigation, ["/arisan/9001"]); assert.equal(JSON.parse(create.data.get("salapi.preview.arisan-draft")!).name, "Checked room"); noExternal(create);
  const join = setup("ArisanJoinScreen"); join.code("FAM234"); await join.click("Review invitation"); await join.click("Join local example"); assert.deepEqual(join.calls.navigation, ["/arisan/1"]); assert.equal(join.data.get("salapi.preview.arisan-joined"), "1"); assert.equal(join.calls.success, 1); noExternal(join);
});

test("failed new draft preserves exact old room, cancelled marker and draft", async () => {
  const data = new Map([["salapi.preview.arisan-room.9001", "prior-room-raw"], ["salapi.preview.arisan-cancelled.9001", "1"], ["salapi.preview.arisan-draft", "prior-draft-raw"], ["unrelated", "keep"]]); const before = [...data];
  const ui = setup("ArisanCreateScreen", { data, failKey: "salapi.preview.arisan-draft" }); ui.change("arisan.create.shareLabel", "10"); await ui.click("Review room terms"); await ui.click("Create local example room"); assert.deepEqual([...data], before); errorOnly(ui);
});

test("a partial transaction failure restores already written values and untouched keys", () => {
  const data = new Map([["salapi.preview.arisan-room.1", "old-room"], ["salapi.preview.arisan-left", "1"], ["salapi.preview.arisan-joined", "old-joined"], ["unrelated", "keep"]]); const ui = setup("ArisanJoinScreen", { data, failKey: "salapi.preview.arisan-joined" }); const before = [...data];
  assert.equal(ui.api.commitPreviewArisanSession([{ key: "salapi.preview.arisan-room.1", value: "changed-room" }, { key: "salapi.preview.arisan-left", value: null }, { key: "salapi.preview.arisan-joined", value: "1" }]), false); assert.deepEqual([...data], before);
  assert.equal(ui.api.commitPreviewArisanSession([{ key: "unrelated", value: null }]), false); assert.equal(data.get("unrelated"), "keep");
});

test("actual room cancel partial marker failure rolls back prior snapshot and membership", async () => {
  const ui = setup("ArisanRoomScreen"); await ui.click("arisan.room.startCta"); const activeSnapshot = ui.data.get("salapi.preview.arisan-room.1")!;
  const room = JSON.parse(activeSnapshot).room; room.status = "Open"; room.drawPhase = null; room.readyToStart = true;
  ui.data.set("salapi.preview.arisan-room.1", JSON.stringify({ version: 1, room })); ui.data.set("salapi.preview.arisan-joined", "1");
  const data = new Map(ui.data); const before = new Map(data); const cancel = setup("ArisanRoomScreen", { data, failKey: "salapi.preview.arisan-cancelled.1" }); await cancel.click("arisan.room.cancelCta"); assert.deepEqual(data, before); errorOnly(cancel); assert.match(text(cancel.tree), /Everyone is funded/);
});

test("actual room leave and join partial failures preserve the exact prior snapshot", async () => {
  const base = setup("ArisanRoomScreen"); await base.click("arisan.room.startCta"); const snapshot = JSON.parse(base.data.get("salapi.preview.arisan-room.1")!); snapshot.room.status = "Open"; snapshot.room.drawPhase = null; snapshot.room.isHost = false; snapshot.room.readyToStart = false;
  const data = new Map([["salapi.preview.arisan-room.1", JSON.stringify(snapshot)], ["salapi.preview.arisan-joined", "1"]]); const before = new Map(data);
  const leave = setup("ArisanRoomScreen", { data, failKey: "salapi.preview.arisan-left" }); await leave.click("arisan.room.leaveCta"); assert.deepEqual(data, before); errorOnly(leave);
  snapshot.room.seats = snapshot.room.seats.filter((seat: { isYou: boolean }) => !seat.isYou).slice(0, 2); snapshot.room.memberCount = 2; snapshot.room.isMember = false; snapshot.room.code = null;
  const joining = new Map([["salapi.preview.arisan-room.1", JSON.stringify(snapshot)], ["salapi.preview.arisan-left", "1"]]); const joinBefore = new Map(joining); const join = setup("ArisanJoinScreen", { data: joining, failKey: "salapi.preview.arisan-joined" }); join.code("FAM234"); await join.click("Review invitation"); await join.click("Join local example"); assert.deepEqual(joining, joinBefore); errorOnly(join);
});

test("checked reads and snapshot save/clear explicitly report failures while initial restore stays tolerant", () => {
  const ui = setup("ArisanJoinScreen", { mode: "get" }); assert.equal(ui.api.readPreviewArisanRoom(1), null); assert.throws(() => ui.api.readPreviewArisanRoom(1, true), /Denied read/); assert.equal(ui.api.clearPreviewArisanRoom(1), false);
  assert.equal(ui.api.commitPreviewArisanSession([{ key: "salapi.preview.arisan-left", value: "1" }, { key: "salapi.preview.arisan-left", value: null }]), false);
});

test("oversized digit-only shares and sub-stroop values cannot create a local room even by invoking a disabled control", async () => {
  for (const amount of ["1" + "0".repeat(308), "9999999999999999999999999999999999999999999999999999999999999999", "1000000000000", "0.00000001"]) {
    const ui = setup("ArisanCreateScreen"); ui.change("arisan.create.shareLabel", amount);
    const review = nodes(ui.tree).find(node => node.type === "Btn" && text(node) === "Review room terms"); assert.equal(review?.props.disabled, true);
    await ui.click("Review room terms"); await ui.click("Create local example room"); assert.equal(ui.calls.navigation.length, 0); assert.equal(ui.data.size, 0); noExternal(ui);
  }
});

for (const mode of ["get", "set", "drop"] as const) test(`finalize ${mode}: storage failure never claims an example payout saved`, async () => {
  const base = setup("ArisanRoomScreen"); await base.click("arisan.room.startCta");
  const snapshot = JSON.parse(base.data.get("salapi.preview.arisan-room.1")!); snapshot.room.drawPhase = "Finalizable"; snapshot.room.canFinalize = true; snapshot.room.canCommit = false; snapshot.room.commitCount = 5; snapshot.room.revealCount = 5; snapshot.room.seats = snapshot.room.seats.map((seat: object) => ({ ...seat, committed: true, revealed: true }));
  const data = new Map([["salapi.preview.arisan-room.1", JSON.stringify(snapshot)]]); const before = new Map(data); const ui = setup("ArisanRoomScreen", { data }); ui.mode(mode); await ui.click("arisan.draw.finalizeCta"); assert.deepEqual(data, before); errorOnly(ui); assert.doesNotMatch(text(ui.tree), /Example payout saved locally/);
});

async function exampleRoom() {
  const host = setup("ArisanRoomScreen"); await host.click("arisan.room.startCta");
  return JSON.parse(host.data.get("salapi.preview.arisan-room.1")!).room as Record<string, unknown>;
}
function phaseRoom(base: Record<string, unknown>, phase: "Open" | "Commit" | "Reveal") {
  const room = structuredClone(base);
  room.cadenceSecs = 60;
  room.status = phase === "Open" ? "Open" : "Active";
  room.drawPhase = phase === "Open" ? null : phase;
  room.readyToStart = false;
  room.commitCount = phase === "Reveal" ? 3 : 1;
  room.revealCount = 0;
  room.canReveal = phase === "Reveal";
  if (phase === "Open") { room.seats = (room.seats as unknown[]).slice(0, 3); room.memberCount = 3; }
  return room;
}

test("member and public room components never render or dispatch demo-friend controls in any active phase", async () => {
  const base = await exampleRoom();
  for (const phase of ["Open", "Commit", "Reveal"] as const) for (const member of [true, false]) {
    const room = { ...phaseRoom(base, phase), isHost: false, isMember: member, canUseDemoFriends: false, viewer: member ? PREVIEW_WALLET.address : null, viewerIdentity: member ? "personal" : "unverified" };
    const ui = setup("ArisanRoomScreen", { preview: false, serverRoom: room }); await ui.settle();
    assert.match(text(ui.tree), member ? /Your saved wallet is a member/ : /Public view/);
    assert.doesNotMatch(text(ui.tree), /arisan\.room\.friendsJoinCta|arisan\.draw\.friendsCommitCta|arisan\.draw\.friendsRevealCta|Testnet demo controls/);
    assert.equal(ui.calls.action, 0); assert.equal(ui.calls.network, 0);
  }
});

test("host display role alone cannot reveal friend controls without the server capability", async () => {
  const base = await exampleRoom();
  for (const phase of ["Open", "Commit", "Reveal"] as const) {
    const ui = setup("ArisanRoomScreen", { preview: false, serverRoom: { ...phaseRoom(base, phase), isHost: true, canUseDemoFriends: false, viewerIdentity: "personal" } }); await ui.settle();
    assert.match(text(ui.tree), /Your saved wallet is the host/);
    assert.doesNotMatch(text(ui.tree), /arisan\.room\.friendsJoinCta|arisan\.draw\.friendsCommitCta|arisan\.draw\.friendsRevealCta/);
    assert.equal(ui.calls.action, 0);
  }
});

test("a host with a server capability can dispatch only the rendered phase's friend action", async () => {
  const base = await exampleRoom();
  for (const [phase, label, action] of [
    ["Open", "arisan.room.friendsJoinCta", "arisanFriendsJoin"],
    ["Commit", "arisan.draw.friendsCommitCta", "arisanFriendsCommit"],
    ["Reveal", "arisan.draw.friendsRevealCta", "arisanFriendsReveal"],
  ] as const) {
    const ui = setup("ArisanRoomScreen", { preview: false, serverRoom: { ...phaseRoom(base, phase), isHost: true, canUseDemoFriends: true } }); await ui.settle();
    assert.match(text(ui.tree), /Testnet demo controls/); assert.match(text(ui.tree), /60 seconds between rounds/);
    assert.match(text(ui.tree), /38\.4615385 Testnet XLM/); assert.match(text(ui.tree), /192\.3076925 Testnet XLM/);
    await ui.click(label); assert.deepEqual(ui.calls.operations, [action]); assert.equal(ui.calls.network, 0);
  }
});

test("a previously rendered host friend handler cannot run after a member/public refresh revokes capability", async () => {
  const base = await exampleRoom(); const host = { ...phaseRoom(base, "Commit"), isHost: true, canUseDemoFriends: true };
  const ui = setup("ArisanRoomScreen", { preview: false, serverRoom: host }); await ui.settle();
  const stale = nodes(ui.tree).find(node => node.type === "Btn" && text(node) === "arisan.draw.friendsCommitCta"); assert.ok(stale);
  await ui.refreshRoom({ ...host, isHost: false, isMember: false, viewer: null, canUseDemoFriends: false });
  assert.doesNotMatch(text(ui.tree), /arisan\.draw\.friendsCommitCta/);
  (stale.props.onClick as () => void)(); await ui.settle(); assert.equal(ui.calls.action, 0); assert.equal(ui.calls.network, 0);
});

test("local host friend controls save examples without invoking any server action or network", async () => {
  const base = phaseRoom(await exampleRoom(), "Open");
  const data = new Map([["salapi.preview.arisan-room.1", JSON.stringify({ version: 1, room: base })]]);
  const host = setup("ArisanRoomScreen", { data }); await host.click("arisan.room.friendsJoinCta"); await host.click("arisan.room.startCta"); await host.click("arisan.draw.friendsCommitCta"); await host.click("arisan.draw.friendsRevealCta");
  const saved = JSON.parse(host.data.get("salapi.preview.arisan-room.1")!).room;
  assert.equal(saved.canUseDemoFriends, true); assert.equal(saved.drawPhase, "Finalizable"); noExternal(host);
  const member = setup("ArisanRoomScreen", { roomId: 2 }); assert.doesNotMatch(text(member.tree), /arisan\.draw\.friendsCommitCta/); noExternal(member);
});

test("old version1 snapshots migrate exact local terms in memory and cannot leak a forged demo capability", async () => {
  const base = await exampleRoom();
  for (const host of [true, false]) {
    const legacy: Record<string, unknown> = { ...base, isHost: host, canUseDemoFriends: true };
    delete legacy.shareStroops; delete legacy.depositStroops; delete legacy.viewer;
    const raw = JSON.stringify({ version: 1, room: legacy }); const data = new Map([["salapi.preview.arisan-room.1", raw]]);
    const ui = setup("ArisanJoinScreen", { data }); const restored = ui.api.readPreviewArisanRoom(1) as Record<string, unknown>;
    assert.ok(restored); assert.equal(restored.viewer, PREVIEW_WALLET.address); assert.equal(restored.shareStroops, "384615385"); assert.equal(restored.depositStroops, "1923076925"); assert.equal(restored.canUseDemoFriends, host);
    assert.equal(ui.data.get("salapi.preview.arisan-room.1"), raw); noExternal(ui);
    const live = setup("ArisanJoinScreen", { data, preview: false }); assert.equal(live.api.readPreviewArisanRoom(1), null); assert.equal(live.api.savePreviewArisanRoom(restored), false); assert.equal(live.api.commitPreviewArisanSession([{ key: "salapi.preview.arisan-joined", value: "1" }]), false);
    assert.equal(live.data.get("salapi.preview.arisan-room.1"), raw); assert.equal(live.data.has("salapi.preview.arisan-joined"), false);
  }
});
