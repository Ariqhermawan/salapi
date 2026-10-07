import test from "node:test";
import assert from "node:assert/strict";
import { arisanRoomPage, newestRoomIds } from "../lib/arisan-list.ts";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as money from "../lib/money.ts";

test("Arisan discovery includes newest IDs beyond the 50 room cap", () => {
  const ids = newestRoomIds(73);
  assert.equal(ids.length, 50);
  assert.equal(ids[0], 73);
  assert.equal(ids.at(-1), 24);
  assert.ok(ids.includes(51));
});
test("Arisan discovery handles empty, small and invalid counts", () => {
  assert.deepEqual(newestRoomIds(0), []);
  assert.deepEqual(newestRoomIds(3), [3,2,1]);
  assert.deepEqual(newestRoomIds(Number.MAX_SAFE_INTEGER + 1), []);
  assert.deepEqual(newestRoomIds(4, 2), [4,3]);
  assert.deepEqual(newestRoomIds(4, 0), []);
});

test("inclusive room cursors reach all older IDs with bounded disjoint pages and no zero IDs", () => {
  const pages: number[][] = []; let cursor: number | undefined;
  do {
    const page = arisanRoomPage(173, cursor); pages.push(page.ids);
    assert.ok(page.ids.length <= 50); assert.ok(page.ids.every(id => id >= 1));
    cursor = page.nextCursor ?? undefined;
  } while (cursor !== undefined);
  const ids = pages.flat(); assert.equal(ids.length, 173); assert.equal(new Set(ids).size, 173);
  assert.equal(ids[0], 173); assert.equal(ids.at(-1), 1); assert.deepEqual(pages.map(page => page.length), [50, 50, 50, 23]);
});
test("cursor and count validation reject malformed, unsafe, future and zero IDs", () => {
  for (const cursor of [0, -1, 1.5, NaN, Infinity, "23", null, {}, 74, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => arisanRoomPage(73, cursor));
  for (const count of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => arisanRoomPage(count));
  assert.deepEqual(arisanRoomPage(0), { ids: [], nextCursor: null });
  assert.deepEqual(arisanRoomPage(1), { ids: [1], nextCursor: null });
  assert.throws(() => arisanRoomPage(0, 1));
});
test("even explicit oversized page requests are capped to 50", () => {
  assert.equal(arisanRoomPage(1000, undefined, 1000).ids.length, 50);
  assert.equal(newestRoomIds(1000, 1000).length, 50);
  assert.deepEqual(arisanRoomPage(5, 3, 2), { ids: [3, 2], nextCursor: 1 });
});

function compile(path: string, jsx = false) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
}
function loadModule<T>(code: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const sandboxModule = { exports: {} as T };
  runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, process: { env: {} }, console, Buffer,
    setTimeout: (fn: () => void) => { fn(); return 1; }, fetch: () => { throw new Error("No network request is authorized"); },
    require: (name: string) => { if (!(name in dependencies)) throw new Error(`Unstubbed ${name}`); return dependencies[name]; }, ...globals });
  return sandboxModule.exports;
}
type Room = { id: number; name: string; status: string; memberCount: number; memberTarget: number; sharePesos: number; potPesos: number; cadence: string; isHost: boolean };
type Page = { ready: true; mine: Room[]; total: number; nextCursor: number | null } | { ready: false; error?: string };
const actionCode = compile("../app/actions.ts");
const componentCode = compile("../components/screens/ArisanListScreen.tsx", true);
function actionSetup(options: { count?: number; memberIds?: number[]; failId?: number; zeroId?: number; authenticated?: boolean } = {}) {
  const calls = { ids: [] as number[], members: [] as number[], identity: 0, signers: 0, submissions: 0 };
  const me = "isolated-readonly-public";
  const api = loadModule<{ arisanList(cursor?: unknown): Promise<Page> }>(actionCode, {
    "@/lib/server/stellar": { arisanRoomsId: () => "isolated-contract", FRIENDS: [], CONTRACTS: {},
      sc: { u32: (value: number) => value }, stroopsToPesos: (value: bigint) => Number(value) * 6.5 / 10000000, fmtPeso: (value: number) => String(value),
      invokeAs: () => { calls.submissions++; throw new Error("Read-only discovery must not submit"); },
      readContract: async (_contract: string, method: string, args: number[] = []) => {
        if (method === "room_count") return options.count ?? 173;
        const id = args[0];
        if (method === "get_room") {
          calls.ids.push(id); if (id === options.failId) throw new Error("Isolated RPC failure");
          return { host: me, name: `Room ${id}`, code: "234567", member_target: 3, share: id === options.zeroId ? 0n : 10000000n, cadence: "Weekly", first_kocok: 1, join_deadline: 1, status: "Open", member_count: 1, round: 0 };
        }
        if (method === "get_members") { calls.members.push(id); return (options.memberIds ?? [6]).includes(id) ? [me] : []; }
        throw new Error(`Unexpected read ${method}`);
      },
    },
    "@/lib/server/userWallet": { currentArisanPublicKey: async () => { calls.identity++; return me; }, getSigner: () => { calls.signers++; throw new Error("Discovery must not obtain a signer"); } },
    "@/lib/money": money, "@/lib/arisan-list": { arisanRoomPage }, "@/lib/local-preview": { isLocalPreview: false },
    "./disaster-actions": {}, "@/lib/supabase/env": {}, "@/lib/supabase/admin": {}, "@/lib/recipient-review": {}, "@/lib/server/arisanCommitment": {}, "@/lib/server/xlmDeposit": {},
    "@/lib/server/walletActivity": { currentWalletActivity: async () => { throw Error("Unexpected activity access in isolated discovery tests"); } },
    "@stellar/stellar-sdk": new Proxy({}, { get() { throw Error("Discovery must not validate signing input"); } }),
    "@/lib/server/arisanAuthorization": { authenticatedArisanWallet: async () => options.authenticated === false
      ? { ok: false, error: "No verified account" } : { ok: true, publicKey: me } },
  });
  return { api, calls };
}
test("the real action reaches a membership older than 150 rooms without signing or overlapping pages", async () => {
  const { api, calls } = actionSetup(); let cursor: number | undefined; const found: number[] = [];
  for (let i = 0; i < 4; i++) {
    const previousReads = calls.ids.length; const page = await api.arisanList(cursor); assert.equal(page.ready, true);
    if (!page.ready) assert.fail("Expected a readable page");
    assert.ok(calls.ids.length - previousReads <= 50); found.push(...page.mine.map(room => room.id)); cursor = page.nextCursor ?? undefined;
  }
  assert.deepEqual(found, [6]); assert.equal(calls.ids.length, 173); assert.equal(new Set(calls.ids).size, 173);
  assert.equal(calls.ids.includes(0), false); assert.equal(calls.signers, 0); assert.equal(calls.submissions, 0);
});

test("a shared or unverified viewer cannot claim personal room membership or host roles", async () => {
  const { api, calls } = actionSetup({ count: 6, authenticated: false });
  const page = await api.arisanList();
  assert.equal(page.ready, true);
  if (!page.ready) assert.fail("Expected public discovery to remain readable");
  assert.equal(page.mine.length, 0);
  assert.equal(calls.signers, 0); assert.equal(calls.submissions, 0);
});
test("the real action rejects invalid cursors and unsafe counts without reading room IDs", async () => {
  for (const cursor of [0, -1, 1.5, "3", null, 174, Number.MAX_SAFE_INTEGER + 1]) {
    const { api, calls } = actionSetup(); assert.equal((await api.arisanList(cursor)).ready, false); assert.equal(calls.ids.length, 0); assert.equal(calls.signers, 0);
  }
  const unsafe = actionSetup({ count: Number.MAX_SAFE_INTEGER + 1 }); assert.equal((await unsafe.api.arisanList()).ready, false); assert.equal(unsafe.calls.ids.length, 0);
});
test("a failed read or unconfirmed zero share fails the whole page instead of moving its cursor", async () => {
  for (const options of [{ failId: 171 }, { zeroId: 171 }]) {
    const { api, calls } = actionSetup(options); const page = await api.arisanList();
    assert.equal(page.ready, false); assert.equal("nextCursor" in page, false);
    if (!page.ready) assert.match(page.error!, /page was not advanced/);
    assert.equal(calls.ids.includes(170), false); assert.ok(calls.ids.length <= 6); assert.equal(calls.signers, 0);
  }
});

type Element = { type: string; props: Record<string, unknown> };
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element; return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function room(id: number, name = `Room ${id}`): Room { return { id, name, status: "Open", memberCount: 1, memberTarget: 3, sharePesos: 6.5, potPesos: 19.5, cadence: "Weekly", isHost: false }; }
function screenSetup(fetchPage: (cursor?: number) => Promise<Page>, preview = false) {
  const state: unknown[] = []; const effects: (() => void)[] = []; const transitions: Promise<unknown>[] = []; const cursors: (number | undefined)[] = []; let index = 0;
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const api = loadModule<{ default(): Element }>(componentCode, {
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react": {
      useState: (initial: unknown) => { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], (value: unknown) => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; },
      useRef: (initial: unknown) => { const i = index++; if (!(i in state)) state[i] = { current: initial }; return state[i]; },
      useEffect: (effect: () => void) => { const i = index++; if (!(i in state)) { state[i] = true; effects.push(effect); } },
      useTransition: () => [false, (action: () => Promise<unknown>) => transitions.push(action())],
    },
    "next/navigation": { useRouter: () => ({ push() {} }) }, "next/link": { default: "Link" }, "next/image": { default: "Image" },
    "@/lib/ui/useGoBack": { useGoBack: () => () => {} }, "@/components/I18nProvider": { useT: () => ({ currency: "tl", t: (value: string) => value }) },
    "@/components/ui/kit": { ...Object.fromEntries(["AppBar", "IconButton", "Card", "Btn", "Chip", "PoweredByStellar"].map(name => [name, name])), T: {}, Ico: new Proxy({}, { get: () => () => null }) },
    "@/lib/ui/currency": { formatLocal: (value: number) => String(value) }, "@/lib/local-preview": { isLocalPreview: preview },
    "./CampaignArisan.module.css": { default: {} }, "./arisan-preview": { readPreviewArisanRoom: () => null },
    "@/app/actions": { arisanList: async (cursor?: number) => { cursors.push(cursor); return fetchPage(cursor); } },
  }, { sessionStorage: { getItem: () => null } });
  const render = () => { index = 0; return api.default(); }; let tree = render(); for (const effect of effects.splice(0)) effect();
  async function settle() { while (transitions.length) await Promise.all(transitions.splice(0)); tree = render(); }
  function button(label: string) { return nodes(tree).find(node => ["button", "Btn"].includes(node.type) && text(node) === label); }
  return { cursors, settle, button, get tree() { return tree; },
    async click(label: string) { const current = button(label); assert.ok(current, `Missing button ${label}`); (current.props.onClick as () => void)(); await settle(); },
  };
}
function roomLinks(tree: Element) { return nodes(tree).filter(node => node.type === "Link" && /^\/arisan\/\d+$/.test(String(node.props.href))); }
test("the real list UI continues through empty membership pages until an older member is reachable", async () => {
  const { api } = actionSetup({ count: 123, memberIds: [6] }); const screen = screenSetup(cursor => api.arisanList(cursor));
  await screen.settle(); assert.equal(roomLinks(screen.tree).length, 0); assert.ok(screen.button("Load older rooms"));
  await screen.click("Load older rooms"); assert.equal(roomLinks(screen.tree).length, 0); assert.ok(screen.button("Load older rooms"));
  await screen.click("Load older rooms"); assert.deepEqual(screen.cursors, [undefined, 73, 23]);
  assert.deepEqual(roomLinks(screen.tree).map(node => node.props.href), ["/arisan/6"]); assert.equal(screen.button("Load older rooms"), undefined);
});
test("older pages accumulate and deduplicate; a successful Refresh resets to the newest page", async () => {
  const responses: Page[] = [
    { ready: true, total: 100, nextCursor: 50, mine: [room(80)] },
    { ready: true, total: 100, nextCursor: null, mine: [room(80, "Updated room"), room(20)] },
    { ready: true, total: 101, nextCursor: 51, mine: [room(99)] },
  ];
  const screen = screenSetup(async () => responses.shift()!); await screen.settle(); await screen.click("Load older rooms");
  assert.deepEqual(roomLinks(screen.tree).map(node => node.props.href), ["/arisan/80", "/arisan/20"]); assert.match(text(screen.tree), /Updated room/);
  await screen.click("Refresh"); assert.deepEqual(roomLinks(screen.tree).map(node => node.props.href), ["/arisan/99"]); assert.deepEqual(screen.cursors, [undefined, 50, undefined]);
});
test("failed pages and thrown requests retain loaded memberships and retry the same older cursor", async () => {
  const responses: (Page | Error)[] = [
    { ready: true, total: 100, nextCursor: 50, mine: [room(80)] }, { ready: false, error: "Isolated page failure" }, new Error("Isolated transport failure"),
    { ready: true, total: 100, nextCursor: null, mine: [room(20)] },
  ];
  const screen = screenSetup(async () => { const next = responses.shift()!; if (next instanceof Error) throw next; return next; });
  await screen.settle();
  for (let attempt = 0; attempt < 2; attempt++) {
    await screen.click("Load older rooms"); assert.deepEqual(roomLinks(screen.tree).map(node => node.props.href), ["/arisan/80"]);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert")); assert.ok(screen.button("Load older rooms"));
  }
  await screen.click("Load older rooms"); assert.deepEqual(screen.cursors, [undefined, 50, 50, 50]); assert.equal(roomLinks(screen.tree).length, 2);
});
test("a failed Refresh preserves loaded older rooms and the previous cursor", async () => {
  let call = 0; const screen = screenSetup(async () => ++call === 1 ? { ready: true, total: 100, nextCursor: 50, mine: [room(80)] } : { ready: false, error: "Isolated refresh failure" });
  await screen.settle(); await screen.click("Refresh"); assert.equal(roomLinks(screen.tree).length, 1); assert.ok(screen.button("Load older rooms"));
});
test("local preview has a terminal cursor and does not request live room pages", async () => {
  const screen = screenSetup(async () => { throw new Error("Preview cannot call live discovery"); }, true); await screen.settle();
  assert.equal(screen.cursors.length, 0); assert.equal(roomLinks(screen.tree).length, 2); assert.equal(screen.button("Load older rooms"), undefined);
});
