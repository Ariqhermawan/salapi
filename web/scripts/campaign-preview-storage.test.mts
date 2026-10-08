import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { saveCampaignPreview, CAMPAIGN_PREVIEW_KEY } from "../lib/campaign-preview-storage.ts";
import { PREVIEW_CAMPAIGNS, PREVIEW_WALLET } from "../lib/local-preview.ts";
import { campaignAmount, campaignSplit } from "../lib/campaign-money.ts";
import { formatStroops } from "../lib/format-stroops.ts";
import * as discoveryCopy from "../lib/i18n/revamp-campaign-discovery.ts";
import * as accountCopy from "../lib/i18n/revamp-account.ts";
import { campaignDonorBadge } from "../lib/ui/testnet-donor.ts";
import * as circlesCopy from "../lib/i18n/revamp-circles.ts";

type Mode = "normal" | "throw" | "drop" | "tamper" | "partial" | "read-blocked";
function storage(mode: Mode, seed = "previous-draft") {
  const memory = new Map<string, string>([[CAMPAIGN_PREVIEW_KEY, seed]]);
  let writes = 0;
  return {
    memory, get writes() { return writes; },
    getItem(key: string) { if (mode === "read-blocked") throw Error("Blocked read"); return memory.get(key) ?? null; },
    setItem(key: string, value: string) {
      writes++;
      if (writes === 1) {
        if (mode === "throw") throw Error("Blocked write");
        if (mode === "drop") return;
        if (mode === "tamper") { memory.set(key, "corrupted"); return; }
        if (mode === "partial") { memory.set(key, "partial"); throw Error("Interrupted write"); }
      }
      memory.set(key, value);
    },
    removeItem(key: string) { memory.delete(key); },
  };
}

for (const mode of ["throw", "drop", "tamper", "partial", "read-blocked"] as const) {
  test(`campaign preview: ${mode} never reports saved and preserves the existing draft`, () => {
    const store = storage(mode);
    assert.equal(saveCampaignPreview(store, PREVIEW_CAMPAIGNS), false);
    assert.equal(store.memory.get(CAMPAIGN_PREVIEW_KEY), "previous-draft");
    if (mode === "read-blocked") assert.equal(store.writes, 0);
  });
}
test("campaign preview: a verified write stores all money, recipients and approvals exactly", () => {
  const store = storage("normal");
  assert.equal(saveCampaignPreview(store, PREVIEW_CAMPAIGNS), true);
  assert.deepEqual(JSON.parse(store.getItem(CAMPAIGN_PREVIEW_KEY)!), PREVIEW_CAMPAIGNS);
});
test("campaign preview: a failed rollback still returns unconfirmed, never fabricated success", () => {
  const memory = new Map([[CAMPAIGN_PREVIEW_KEY, "old-draft"]]);
  let writes = 0;
  const store = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem(key: string) { if (++writes === 1) memory.set(key, "partial"); throw Error("Storage unavailable"); },
    removeItem() { throw Error("Storage unavailable"); },
  };
  assert.equal(saveCampaignPreview(store, PREVIEW_CAMPAIGNS), false);
  assert.equal(memory.get(CAMPAIGN_PREVIEW_KEY), "partial");
});

type Element = { type: unknown; props: Record<string, unknown> };
const media = {} as { vaultCampaignMedia: unknown };
runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/vault-campaign-media.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: media, require(name: string) {
  assert.equal(name, "./local-preview"); return { PREVIEW_CAMPAIGNS };
} });
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  return value && typeof value === "object" && "props" in value ? text((value as Element).props.children) : "";
}
function screen(mode: Mode) {
  const code = ts.transpileModule(readFileSync(new URL("../components/screens/CampaignScreen.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const component = {} as { default(props: { id: string }): Element };
  const store = storage(mode, JSON.stringify(PREVIEW_CAMPAIGNS));
  const rootStates: unknown[] = [], cardStates: unknown[] = [];
  let states = rootStates, cursor = 0;
  const forbidden = () => { throw Error("No network or server actions permitted in campaign UI tests"); };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  runInNewContext(code, { exports: component, sessionStorage: store, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "react") return {
      useState(initial: unknown) { const index = cursor++, active = states; if (!(index in active)) active[index] = typeof initial === "function" ? initial() : initial;
        return [active[index], (value: unknown) => { active[index] = typeof value === "function" ? value(active[index]) : value; }]; },
      useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (fn: unknown) => fn,
    };
    if (name === "next/link") return { default: "Link" };
    if (name === "next/image") return { default: "Image" };
    if (name === "@/components/D4CampaignGallery") return { default: "D4CampaignGallery" };
    if (name === "@/components/ui/kit") return { T: {}, Ico: new Proxy({}, { get: () => () => null }), Btn: "Btn", Card: "Card", PoweredByStellar: "PoweredByStellar" };
    if (name === "@/components/ui/SuccessMotion") return { default: "SuccessMotion" };
    if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ locked: false, run: forbidden }) };
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en" }) };
    if (name === "@/lib/i18n/revamp-account") return accountCopy;
    if (name === "@/lib/i18n/revamp-circles") return circlesCopy;
    if (name === "@/lib/ui/testnet-donor") return { campaignDonorBadge };
    if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => { throw Error("Navigation forbidden in isolated campaign storage tests"); } };
    if (["@/components/AvailableWalletBalance", "@/components/CampaignDonationBadge"].includes(name)) return { __esModule: true, default: () => null };
    if (name === "@/lib/local-preview") return { isLocalPreview: true, PREVIEW_WALLET, PREVIEW_CAMPAIGNS };
    if (name === "@/lib/campaign-preview-storage") return { saveCampaignPreview };
    if (name === "@/lib/campaign-money") return { campaignAmount, campaignSplit };
    if (name === "@/lib/format-stroops") return { formatStroops };
    if (name === "@/lib/vault-campaign-media") return media;
    if (name === "@/lib/i18n/revamp-campaign-discovery") return discoveryCopy;
    if (name.endsWith(".module.css")) return { default: {} };
    return {};
  }, fetch: forbidden });
  let root: Element, card: Element;
  function render() {
    states = rootStates; cursor = 0; root = component.default({ id: "101" });
    const child = nodes(root).find(node => typeof node.type === "function" && node.type.name === "CampaignCard")!;
    assert.ok(child); states = cardStates; cursor = 0;
    card = (child.type as (props: unknown) => Element)(child.props);
  }
  render();
  function reviewDonation() {
    const input = nodes(card).find(node => node.type === "input" && node.props.inputMode === "decimal")!;
    (input.props.onChange as (event: unknown) => void)({ target: { value: "5" } }); render();
    const review = nodes(card).find(node => node.type === "Btn" && text(node) === "Donate · Review amount")!;
    (review.props.onClick as () => void)(); render();
  }
  return {
    store, review: reviewDonation,
    async donate() {
      reviewDonation();
      const confirm = nodes(root).find(node => node.type === "Btn" && text(node) === "Confirm local example")!;
      assert.ok(confirm); (confirm.props.onClick as () => void)();
      await Promise.resolve(); render();
    },
    get root() { return root; }, get card() { return card; },
  };
}
test("shared route motion cannot retain a transformed fixed-dialog containing block or modal stacking context", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const route = readFileSync(new URL("../components/RouteMotion.tsx", import.meta.url), "utf8");
  const entry = css.match(/\.sl-state-enter\s*\{([^}]+)\}/)?.[1];
  const keyframes = css.match(/@keyframes\s+sl-section-in\s*\{[\s\S]*?}\s*}/)?.[0];
  assert.ok(entry); assert.ok(keyframes);
  assert.match(route, /className="sl-state-enter"/);
  assert.match(entry, /animation:\s*sl-section-in\s+\.28s\s+ease-out\s+backwards/);
  assert.doesNotMatch(entry + keyframes, /transform\s*:|filter\s*:|will-change\s*:|contain\s*:|\bforwards\b|\bboth\b/);
  assert.match(keyframes, /opacity:\s*\.6/); assert.match(keyframes, /opacity:\s*1/);
  assert.match(css, /\.sl-state-enter:has\(\[aria-modal="true"\]\)\s*\{\s*animation:\s*none\s*}/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\{\.sl-state-enter\{animation:none}}/);
});

test("visible app frame explicitly contains fixed dialogs without a transformed scroll wrapper", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const frame = css.match(/\.sl-app-frame\s*\{([^}]+)\}/)?.[1]; assert.ok(frame);
  assert.match(frame, /container-type:\s*inline-size\s*;/);
  assert.match(frame, /contain:\s*layout\s*;/);
  assert.doesNotMatch(frame, /transform\s*:|filter\s*:|will-change\s*:/);
  const route = css.match(/\.sl-state-enter\s*\{([^}]+)\}/)?.[1]; assert.ok(route);
  assert.doesNotMatch(route, /contain\s*:|transform\s*:/);
});

test("actual campaign review remains frame-fixed with a bounded scrollable card and cancel cannot submit", () => {
  const ui = screen("normal"); ui.review();
  const dialog = nodes(ui.root).find(node => node.props.role === "dialog")!; assert.ok(dialog);
  const overlay = dialog.props.style as Record<string, unknown>;
  assert.equal(dialog.props["aria-modal"], "true"); assert.equal(dialog.props.tabIndex, -1);
  assert.equal(overlay.position, "fixed"); assert.equal(overlay.inset, 0); assert.equal(overlay.zIndex, 100);
  assert.equal(overlay.display, "flex"); assert.equal(overlay.alignItems, "center"); assert.equal(overlay.justifyContent, "center");
  assert.equal(overlay.boxSizing, "border-box"); assert.equal(overlay.overflowY, "auto");
  const card = nodes(dialog).find(node => node.type === "Card")!; assert.ok(card);
  const style = card.props.style as Record<string, unknown>;
  assert.equal(style.minHeight, 0); assert.equal(style.maxHeight, "100%"); assert.equal(style.overflowY, "auto");
  assert.equal(style.overscrollBehavior, "contain"); assert.equal(style.boxSizing, "border-box");
  const source = readFileSync(new URL("../components/screens/CampaignScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /dialog\?\.focus\(\{ preventScroll: true }\)/);
  assert.match(source, /previousFocus\?\.focus\(\{ preventScroll: true }\)/);
  const cancel = nodes(dialog).find(node => node.type === "Btn" && text(node) === "Cancel")!; assert.ok(cancel);
  (cancel.props.onClick as () => void)();
  assert.equal(ui.store.writes, 0);
  assert.equal(ui.store.memory.get(CAMPAIGN_PREVIEW_KEY), JSON.stringify(PREVIEW_CAMPAIGNS));
});

test("actual opening handler captures its opener before a disabled commit and Escape restores it without scrolling", () => {
  const source = readFileSync(new URL("../components/screens/CampaignScreen.tsx", import.meta.url), "utf8");
  const file = ts.createSourceFile("CampaignScreen.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let runSource = "", effectSource = "";
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === "run" && node.initializer) runSource = node.initializer.getText(file);
    if (ts.isCallExpression(node) && node.expression.getText(file) === "useEffect" && node.arguments[0]?.getText(file).includes("function handleKey")) effectSource = node.arguments[0].getText(file);
    ts.forEachChild(node, visit);
  }
  visit(file); assert.ok(runSource); assert.ok(effectSource);
  const events: string[] = [], focusOptions: Record<string, unknown>[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  let active: FocusElement;
  function setActive(element: FocusElement) { active = element; }
  class FocusElement {
    disabled = false;
    readonly name: string;
    constructor(name: string) { this.name = name; }
    focus(options: Record<string, unknown>) {
      events.push(`focus:${this.name}`);
      if (this.disabled) return;
      focusOptions.push(options); setActive(this);
    }
    querySelectorAll() { return []; }
  }
  const opener = new FocusElement("review"), body = new FocusElement("body"), dialog = new FocusElement("dialog");
  active = opener;
  const context = {
    exports: {} as { open(...args: unknown[]): void; effect(): (() => void) | undefined },
    HTMLElement: FocusElement, openerRef: { current: null as FocusElement | null }, dialogRef: { current: dialog },
    confirm: null as unknown, busy: false, submission: { locked: false },
    document: {
      get activeElement() { events.push(`active:${active.name}`); return active; },
      addEventListener(name: string, listener: (event: unknown) => void) { listeners.set(name, listener); },
      removeEventListener(name: string) { listeners.delete(name); },
    },
    setDone() {}, setLocalDone() {}, setError() {},
    setConfirm(value: unknown) {
      context.confirm = value;
      opener.disabled = value !== null;
      if (opener.disabled) { events.push("disable:review"); active = body; }
    },
  };
  const code = ts.transpileModule(`export const open = ${runSource}; export const effect = ${effectSource};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, context);
  const forbidden = () => { throw Error("Opening or cancelling a dialog must not submit"); };
  context.exports.open("Review", forbidden, false, forbidden);
  assert.equal(context.openerRef.current, opener);
  assert.ok(events.indexOf("active:review") < events.indexOf("disable:review"));
  assert.equal(active, body); assert.equal(opener.disabled, true);
  const cleanup = context.exports.effect(); assert.ok(cleanup);
  assert.equal(active, dialog);
  listeners.get("keydown")!({ key: "Escape" });
  assert.equal(context.confirm, null); assert.equal(opener.disabled, false);
  cleanup();
  assert.equal(active, opener); assert.equal(listeners.has("keydown"), false);
  assert.deepEqual(focusOptions.map(options => options.preventScroll), [true, true]);
  context.submission.locked = true;
  context.openerRef.current = null;
  const eventCount = events.length;
  context.exports.open("Locked", forbidden, false, forbidden);
  assert.equal(context.openerRef.current, null); assert.equal(events.length, eventCount);
});

test("actual campaign donation failure keeps amount/escrow/input and has no success animation", async () => {
  for (const mode of ["throw", "drop", "tamper", "partial", "read-blocked"] as const) {
    const ui = screen(mode); await ui.donate();
    assert.match(text(ui.root), /Could not verify browser storage/);
    assert.equal(nodes(ui.root).some(node => node.type === "SuccessMotion"), false);
    assert.equal(nodes(ui.card).find(node => node.type === "input" && node.props.inputMode === "decimal")?.props.value, "5");
    assert.equal(ui.store.memory.get(CAMPAIGN_PREVIEW_KEY), JSON.stringify(PREVIEW_CAMPAIGNS));
    assert.match(text(ui.card), /740/);
  }
});
test("actual campaign donation announces success only after verified storage and reload sees the new amount", async () => {
  const ui = screen("normal"); await ui.donate();
  assert.ok(nodes(ui.root).some(node => node.type === "SuccessMotion"));
  assert.match(text(ui.root), /Local preview saved for this browser session/);
  const saved = JSON.parse(ui.store.getItem(CAMPAIGN_PREVIEW_KEY)!);
  assert.equal(saved[0].total, "7450000000"); assert.equal(saved[0].escrow, "7450000000");
  assert.equal(saved[0].contribution.amount, "50000000");
  assert.equal(nodes(ui.card).find(node => node.type === "input" && node.props.inputMode === "decimal")?.props.value, "");
});
