import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { CURRENCY, formatLocalAmount, localAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { previewPledgeAllocation } from "../lib/circles/pledge-allocation.ts";
import { PREVIEW_WALLET } from "../lib/local-preview.ts";
import { isLocale, type Locale } from "../lib/i18n/config.ts";
import type { Circle } from "../lib/circles/types.ts";
import type { LocalSupportRecord } from "../lib/circles/local-support.ts";
import * as revampCircles from "../lib/i18n/revamp-circles.ts";
import type { SignupIdentityState } from "../lib/ui/useCirclesSignupIdentity.ts";
import * as contentCopy from "../lib/i18n/circles-content.ts";

type Element = { type: string; props: Record<string, unknown> };
type Component = { default(props: { circle: Circle }): Element; CirclesPreviewDonateScreen(props: { circle: Circle }): Element };
type StorageMode = "normal" | "throw" | "drop" | "tamper";
function transpile(path: string, jsx = false) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText;
}
const componentCode = transpile("../components/screens/CirclesDonateScreen.tsx", true);
const supportCode = transpile("../lib/circles/local-support.ts");
const fixtureCache = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (fixtureCache.has(path)) return fixtureCache.get(path)!;
  const output: Record<string, unknown> = {};
  fixtureCache.set(path, output);
  runInNewContext(transpile(path), {
    exports: output,
    require(name: string) {
      if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
      if (name === "./types") return fixture("../lib/circles/types.ts");
      throw new Error(`Unexpected fixture dependency: ${name}`);
    },
  });
  return output;
}
const catalog = fixture("../lib/circles/seed.ts") as { getCircle(id: string): Circle | undefined };
const profiles = fixture("../lib/circles/organizers.ts");

// Run real handlers, allocation and session writer. Only isolated in-memory
// sessionStorage is permitted. Network, durable storage, navigation and real
// signup boundaries fail closed. A supplied action result remains a VM stub.
function setup(options: { currency?: Locale; locale?: Locale; circleId?: string; preview?: boolean; storageMode?: StorageMode; identity?: SignupIdentityState; joinResult?: { ok: boolean; error?: string; kind?: string; persisted?: boolean } } = {}) {
  let currency = options.currency ?? "tl";
  const locale = options.locale ?? "en";
  const preview = options.preview ?? true;
  let storageMode = options.storageMode ?? "normal";
  const circle = catalog.getCircle(options.circleId ?? "tino-relief")!;
  assert.ok(circle, "Use a known fixture, never an invented circle ID");
  const state: unknown[] = [];
  let cursor = 0;
  let uuid = 0;
  const transitions: Promise<unknown>[] = [];
  const calls = { joins: 0, network: 0, reads: 0, writes: 0, persistentStorage: 0, navigation: 0 };
  const joinPayloads: unknown[] = [];
  const memory = new Map<string, string>();
  const forbidden = (kind: "network" | "persistentStorage" | "navigation") => () => {
    calls[kind]++;
    throw new Error(`Unexpected ${kind} side effect in isolated component test`);
  };
  const storage = {
    getItem(key: string) { calls.reads++; return memory.get(key) ?? null; },
    setItem(key: string, value: string) {
      calls.writes++;
      if (storageMode === "throw") throw new Error("Isolated session storage unavailable");
      if (storageMode === "drop") return;
      if (storageMode === "tamper") {
        const data = JSON.parse(value);
        data.supports[0].organizerLabel = "Changed during isolated read-back";
        value = JSON.stringify(data);
      }
      memory.set(key, value);
    },
    removeItem() { throw new Error("Unexpected session removal"); },
    clear() { throw new Error("Unexpected session clear"); },
  };
  const context = {
    fetch: forbidden("network"), XMLHttpRequest: forbidden("network"), WebSocket: forbidden("network"),
    sessionStorage: storage, localStorage: { getItem: forbidden("persistentStorage"), setItem: forbidden("persistentStorage") },
    window: { sessionStorage: storage, fetch: forbidden("network") },
    navigator: { sendBeacon: forbidden("network") }, crypto: { randomUUID: () => `isolated-${++uuid}` },
  };
  const supports = {} as { recordLocalSupport(input: unknown): LocalSupportRecord | null; readLocalSupports(): LocalSupportRecord[] };
  runInNewContext(supportCode, {
    ...context, exports: supports,
    require(name: string) {
      if (name === "../local-preview") return { isLocalPreview: preview, PREVIEW_WALLET };
      if (name === "../i18n/config") return { isLocale };
      if (name === "../ui/currency") return { pesoFromLocal };
      if (name === "./seed") return catalog;
      if (name === "./pledge-allocation") return { previewPledgeAllocation };
      throw new Error(`Unexpected support dependency: ${name}`);
    },
  });
  const component = {} as Component;
  const jsx = (type: unknown, props: Record<string, unknown>): Element => typeof type === "function" ? type(props) : { type: String(type), props };
  const icons = new Proxy({}, { get: () => () => null });
  const signupEmail = {} as { default(props: unknown): Element };
  runInNewContext(transpile("../components/CirclesSignupEmail.tsx", true), { exports: signupEmail, require(name: string) {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    if (name === "@/components/I18nProvider") return { useT: () => ({ locale }) };
    if (name === "@/lib/i18n/revamp-circles") return revampCircles;
    if (name.endsWith(".module.css")) return { default: {} };
    throw Error(`Unexpected signup field dependency: ${name}`);
  } });
  runInNewContext(componentCode, {
    ...context, exports: component,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
          return [state[index], (value: unknown) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
        },
        useRef(initial: unknown) { const index = cursor++; if (!(index in state)) state[index] = { current: initial }; return state[index]; },
        useTransition: () => [false, (action: () => Promise<unknown>) => transitions.push(action())],
      };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name === "@/components/ui/SuccessMotion") return { default: "SuccessMotion" };
      if (name === "@/components/CircleTestnetDonate") return { default: "CircleTestnetDonate" };
      if (name === "@/components/ui/OrganizerVerification") return { default: "OrganizerVerification" };
      if (name === "@/components/ui/ExampleOrganizerAvatar") return { default: "ExampleOrganizerAvatar" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency, locale }) };
      if (name === "@/lib/i18n/revamp-circles") return revampCircles;
      if (name === "@/lib/i18n/circles-content") return contentCopy;
      if (name === "@/components/CirclesSignupEmail") return signupEmail;
      if (name === "@/lib/ui/useCirclesSignupIdentity") return { useCirclesSignupIdentity: () => ({ identity: options.identity ?? { status: "guest" }, refresh: () => {}, captureOwnerRevision: () => 0, isCurrentOwner: () => true }) };
      if (name === "@/components/ui/kit") return { T: {}, Ico: icons, PoweredByStellar: "PoweredByStellar" };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => forbidden("navigation") };
      if (name === "@/lib/ui/currency") return { CURRENCY, formatLocalAmount, localAmount, pesoFromLocal };
      if (name === "@/lib/circles/pledge-allocation") return { previewPledgeAllocation };
      if (name === "@/lib/circles/local-support") return supports;
      if (name === "@/lib/circles/organizers") return profiles;
      if (name === "@/lib/local-preview") return { isLocalPreview: preview };
      if (name.endsWith(".module.css")) return { default: {} };
      if (name === "@/app/actions") return {
        joinCirclesWaitlist(payload: unknown) {
          calls.joins++;
          joinPayloads.push(payload);
          if (options.joinResult) return Promise.resolve(options.joinResult);
          throw new Error("Unexpected signup action in isolated test");
        },
      };
      throw new Error(`Unexpected component dependency: ${name}`);
    },
  });
  // This suite exercises the retained illustrative/local flow, not the new
  // network donation component (which has its own receipt and auth tests).
  const render = () => { cursor = 0; return component.CirclesPreviewDonateScreen({ circle }); };
  let tree = render();
  const settle = async () => { while (transitions.length) await Promise.all(transitions.splice(0)); tree = render(); };
  const input = (id: string) => {
    const node = nodes(tree).find(node => node.type === "input" && node.props.id === id);
    assert.ok(node, `Missing input: ${id}`);
    return node;
  };
  const button = (label: string) => {
    const node = nodes(tree).find(node => node.type === "button" && text(node).trim() === label);
    assert.ok(node, `Missing button: ${label}`);
    return node;
  };
  return {
    calls, joinPayloads, supports, get tree() { return tree; }, input, button,
    amount(value: string) { (input("circle-preview-amount").props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
    email(value: string) { (input("circle-launch-email").props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
    notify(value = true) { (input("circle-launch-notify").props.onChange as (event: unknown) => void)({ target: { checked: value } }); tree = render(); },
    anonymous(value: boolean) { (input("circle-demo-anonymous").props.onChange as (event: unknown) => void)({ target: { checked: value } }); tree = render(); },
    comment(value: string) { const field = nodes(tree).find(node => node.type === "textarea" && node.props.id === "circle-demo-comment"); assert.ok(field); (field.props.onChange as (event: unknown) => void)({ target: { value } }); tree = render(); },
    currency(value: Locale) { currency = value; tree = render(); }, storageMode(value: StorageMode) { storageMode = value; },
    async invoke(handler: () => void) { handler(); await settle(); },
    async click(label: string) { (button(label).props.onClick as () => void)(); await settle(); },
    async submit(count = 1) {
      const form = nodes(tree).find(node => node.type === "form");
      assert.ok(form, "Missing signup form");
      for (let index = 0; index < count; index++) (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
      await settle();
    },
  };
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  return [node, ...nodes(node.props.children)];
}
function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).join("");
  if (value && typeof value === "object" && "props" in value) return text((value as Element).props.children);
  return "";
}
function allocation(tree: Element) {
  const ticket = nodes(tree).find(node => node.props["aria-label"] === "Illustrative pledge allocation");
  assert.ok(ticket, "Allocation must be visible before continuing");
  return nodes(ticket).filter(node => node.type === "div" && nodes(node).some(child => child.type === "dt")).map(row => ({
    label: text(nodes(row).find(node => node.type === "dt")), values: nodes(row).filter(node => node.type === "dd").map(text),
  }));
}
function expected(currency: Locale, beneficiary: number, organizer: number, percentage: number) {
  return [
    { label: "Beneficiary", values: [`${100 - percentage}%`, formatLocalAmount(beneficiary, currency)] },
    { label: "Organizer operations", values: [`${percentage}%`, formatLocalAmount(organizer, currency)] },
  ];
}
function noExternalEffects(calls: ReturnType<typeof setup>["calls"]) {
  assert.equal(calls.joins, 0); assert.equal(calls.network, 0); assert.equal(calls.persistentStorage, 0); assert.equal(calls.navigation, 0);
}
function noWrites(calls: ReturnType<typeof setup>["calls"]) { noExternalEffects(calls); assert.equal(calls.writes, 0); assert.equal(calls.reads, 0); }
function hasForm(tree: Element) { return nodes(tree).some(node => node.type === "form"); }
function saved(tree: Element) { return nodes(tree).some(node => node.type === "SuccessMotion" && /Local donation demo saved/.test(String(node.props.title))); }
function signupDone(tree: Element) { return nodes(tree).some(node => node.props.role === "status" && /signup complete|subscription is saved/.test(text(node))); }
function supportedLink(tree: Element) { return nodes(tree).some(node => node.type === "Link" && node.props.href === "/circles/supported"); }

test("zero-percent allocation uses entered nominal with no early storage or network access", () => {
  const screen = setup(); screen.amount("100.25");
  assert.deepEqual(allocation(screen.tree), expected("tl", 100.25, 0, 0));
  assert.equal(screen.button("Review local donation").props.disabled, false);
  assert.match(text(screen.tree), /Platform fee: not configured/); noWrites(screen.calls);
});
test("five-percent nominal rows respond to entry and presets without rounding the typed total", async () => {
  const screen = setup({ currency: "en", circleId: "ate-mei-dialysis" }); screen.amount("10.01");
  assert.deepEqual(allocation(screen.tree), expected("en", 9.51, 0.5, 5));
  await screen.click("$20");
  assert.equal(screen.input("circle-preview-amount").props.value, "20"); assert.equal(screen.button("$20").props["aria-pressed"], true);
  assert.deepEqual(allocation(screen.tree), expected("en", 19, 1, 5));
  screen.amount("0.50"); assert.deepEqual(allocation(screen.tree), expected("en", 0.47, 0.03, 5)); noWrites(screen.calls);
});
test("invalid, negative, oversize and excess-precision entries disable and guard local review", async () => {
  const invalid: Record<Locale, string[]> = {
    en: ["", "0", "-10", "1.2.3", "1e3", "1.005", "1000000000"], tl: ["", "0", "-10", "1.2.3", "1.001", "10000000.01"],
    id: ["0", "-10", "50000.5", "2758620690"], vi: ["0", "-10", "50000.1", "4396551725"],
  };
  for (const currency of ["en", "tl", "id", "vi"] as const) for (const value of invalid[currency]) {
    const screen = setup({ currency, circleId: "ate-mei-dialysis" }); screen.amount(value);
    assert.equal(screen.button("Review local donation").props.disabled, true, `${currency}: ${value}`);
    assert.equal(screen.input("circle-preview-amount").props["aria-invalid"], true);
    // Deliberately invoke the disabled handler to verify its own validity guard.
    await screen.click("Review local donation");
    assert.equal(hasForm(screen.tree), false); assert.equal(saved(screen.tree), false);
    assert.equal(nodes(screen.tree).some(node => node.type === "button" && text(node).trim() === "Confirm local demo"), false);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert"));
    assert.ok(allocation(screen.tree).every(row => row.values.every(value => value === "-"))); noWrites(screen.calls);
  }
});
test("Review and Change amount retain the exact nominal and split without writing a record", async () => {
  const screen = setup({ currency: "en", circleId: "ate-mei-dialysis" }); screen.amount("10.01");
  const before = allocation(screen.tree); await screen.click("Review local donation");
  assert.equal(hasForm(screen.tree), false); assert.deepEqual(allocation(screen.tree), before);
  assert.match(text(screen.tree), /Check your cause and amount/); noWrites(screen.calls);
  await screen.click("Change amount"); assert.equal(screen.input("circle-preview-amount").props.value, "10.01");
  assert.deepEqual(allocation(screen.tree), before); noWrites(screen.calls);
});
test("only Confirm writes and successful read-back yields a single record with frozen currency", async () => {
  const screen = setup({ currency: "en", circleId: "ate-mei-dialysis" }); screen.amount("10.01");
  await screen.click("Review local donation"); const confirm = screen.button("Confirm local demo").props.onClick as () => void;
  noWrites(screen.calls); await screen.invoke(confirm);
  assert.equal(screen.calls.writes, 1); assert.ok(screen.calls.reads >= 2, "Read-back is required before saved success");
  assert.equal(saved(screen.tree), true); assert.equal(supportedLink(screen.tree), true);
  const records = screen.supports.readLocalSupports(); assert.equal(records.length, 1);
  assert.equal(records[0].circleId, "ate-mei-dialysis"); assert.equal(records[0].displayValue, "10.01"); assert.equal(records[0].currency, "en");
  assert.equal(records[0].totalMinor, "1001"); assert.equal(records[0].beneficiaryMinor, "951"); assert.equal(records[0].organizerMinor, "50");
  await screen.invoke(confirm); assert.equal(screen.calls.writes, 1, "Retained handler must not duplicate confirmation");
  screen.currency("id"); assert.deepEqual(allocation(screen.tree), expected("en", 9.51, 0.5, 5), "Saved ticket uses saved currency");
  noExternalEffects(screen.calls);
});
test("failed, dropped or changed read-back cannot show saved success and failure can be retried", async () => {
  for (const mode of ["throw", "drop", "tamper"] as const) {
    const screen = setup({ storageMode: mode }); await screen.click("Review local donation"); await screen.click("Confirm local demo");
    assert.equal(saved(screen.tree), false, mode); assert.equal(supportedLink(screen.tree), false, mode);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert" && /could not save/.test(text(node))), mode);
    assert.ok(screen.button("Confirm local demo")); noExternalEffects(screen.calls);
    if (mode !== "tamper") {
      screen.storageMode("normal"); await screen.click("Confirm local demo");
      assert.equal(saved(screen.tree), true); assert.equal(screen.supports.readLocalSupports().length, 1);
    }
  }
});
test("completed examples cannot enter local review by invoking their disabled handler", async () => {
  const screen = setup({ circleId: "cats-clinic-recovery" }); assert.equal(screen.button("Review local donation").props.disabled, true);
  await screen.click("Review local donation"); assert.equal(saved(screen.tree), false);
  assert.ok(nodes(screen.tree).some(node => node.props.role === "alert" && /example is complete/.test(text(node)))); noWrites(screen.calls);
});
test("optional local signup defaults every opt-in false and requires an explicit choice without action, storage or network", async () => {
  const screen = setup({ circleId: "ate-mei-dialysis" }); screen.amount("100"); await screen.click("Optional launch signup");
  const optIns = nodes(screen.tree).filter(node => node.type === "input" && node.props.type === "checkbox");
  assert.equal(optIns.length, 3); assert.ok(optIns.every(node => node.props.checked === false));
  screen.email("qa@example.invalid"); await screen.submit();
  assert.equal(signupDone(screen.tree), false); noWrites(screen.calls);
  screen.notify(); await screen.submit();
  assert.equal(signupDone(screen.tree), true); assert.equal(saved(screen.tree), false); assert.equal(supportedLink(screen.tree), false);
  assert.equal(hasForm(screen.tree), false); assert.deepEqual(allocation(screen.tree), expected("tl", 95, 5, 5)); noWrites(screen.calls);
});
test("invalid email cannot complete either signup branch or reach a side-effect boundary", async () => {
  for (const preview of [true, false]) for (const email of ["", "not-an-email", "qa@invalid", "qa example.invalid"]) {
    const screen = setup({ preview }); await screen.click(preview ? "Optional launch signup" : "Continue to optional signup");
    screen.email(email); await screen.submit(); assert.equal(signupDone(screen.tree), false); assert.equal(saved(screen.tree), false);
    assert.equal(hasForm(screen.tree), true);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert" && /valid email/.test(text(node)))); noWrites(screen.calls);
  }
});
test("non-preview Continue preserves the signup payload and never writes local support", async () => {
  const screen = setup({ preview: false, currency: "en", circleId: "ate-mei-dialysis", joinResult: { ok: true, kind: "launch-subscription", persisted: true } }); screen.amount("10.01");
  const before = allocation(screen.tree); await screen.click("Continue to optional signup"); assert.deepEqual(allocation(screen.tree), before);
  await screen.click("Change amount"); assert.equal(screen.input("circle-preview-amount").props.value, "10.01");
  await screen.click("Continue to optional signup"); screen.email("qa@example.invalid"); screen.notify(); await screen.submit();
  assert.equal(screen.calls.joins, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(screen.joinPayloads)), [{ email: "qa@example.invalid", circleId: "ate-mei-dialysis", locale: "en", pesoPledge: pesoFromLocal(10.01, "en"), anonymous: false, notifyOk: true, marketingOk: false }]);
  assert.equal(signupDone(screen.tree), true); assert.equal(saved(screen.tree), false); assert.equal(supportedLink(screen.tree), false);
  assert.equal(screen.calls.writes, 0); assert.equal(screen.calls.reads, 0); assert.equal(screen.calls.network, 0);
  assert.equal(screen.calls.persistentStorage, 0); assert.equal(screen.calls.navigation, 0);
});
test("non-preview action errors cannot claim processed signup or a saved donation", async () => {
  for (const joinResult of [undefined, { ok: false, error: "Isolated rejected request" }]) {
    const screen = setup({ preview: false, joinResult }); await screen.click("Continue to optional signup");
    screen.email("qa@example.invalid"); screen.notify(); await screen.submit(); assert.equal(signupDone(screen.tree), false); assert.equal(saved(screen.tree), false);
    assert.equal(hasForm(screen.tree), true); assert.ok(nodes(screen.tree).some(node => node.props.role === "alert"));
    assert.equal(screen.calls.joins, 1); assert.equal(screen.calls.writes, 0); assert.equal(screen.calls.reads, 0); assert.equal(screen.calls.network, 0);
  }
});
test("currency changes preserve economic value and recompute proposed allocation", () => {
  const screen = setup({ currency: "en", circleId: "ate-mei-dialysis" }); screen.amount("10.01");
  for (const [currency, value, beneficiary, organizer] of [
    ["tl", "580.58", 551.55, 29.03], ["id", "160160", 152152, 8008], ["vi", "255255", 242492, 12763], ["en", "10.01", 9.51, 0.5],
  ] as const) {
    screen.currency(currency); assert.equal(screen.input("circle-preview-amount").props.value, value);
    assert.deepEqual(allocation(screen.tree), expected(currency, beneficiary, organizer, 5)); assert.equal(screen.button("Review local donation").props.disabled, false);
  }
  noWrites(screen.calls);
});
test("seven-percent proposal stays seven percent without an invented platform deduction", () => {
  const screen = setup({ currency: "id", circleId: "creator-baybayin" }); screen.amount("50000");
  assert.deepEqual(allocation(screen.tree), expected("id", 46500, 3500, 7));
  assert.match(text(screen.tree), /Platform fee: not configured/); assert.doesNotMatch(text(screen.tree), /2%|platform deduction/i); noWrites(screen.calls);
});

test("local review preferences stay unsaved until confirmation and retain anonymity/comment after read-back", async () => {
  const screen = setup({ currency: "en" }); screen.amount("50");
  assert.equal(nodes(screen.tree).some(node => node.props.id === "circle-demo-comment"), false);
  await screen.click("Review local donation");
  assert.equal(screen.input("circle-demo-anonymous").props.checked, false);
  screen.anonymous(true); screen.comment("  A little encouragement from this local demo.  ");
  noWrites(screen.calls);
  await screen.click("Change amount"); await screen.click("Review local donation");
  assert.equal(screen.input("circle-demo-anonymous").props.checked, true);
  const field = nodes(screen.tree).find(node => node.props.id === "circle-demo-comment")!;
  assert.equal(field.props.maxLength, 300); assert.equal(field.props.value, "  A little encouragement from this local demo.  ");
  noWrites(screen.calls);
  await screen.click("Confirm local demo");
  const [record] = screen.supports.readLocalSupports();
  assert.equal(record.anonymous, true); assert.equal(record.comment, "A little encouragement from this local demo.");
  assert.equal(record.displayValue, "50"); assert.equal(saved(screen.tree), true);
  assert.equal(screen.calls.joins, 0); assert.equal(screen.calls.network, 0); assert.equal(screen.calls.persistentStorage, 0);
});

test("overlong handler input cannot bypass the local comment bound, and live signup never exposes or submits a comment", async () => {
  const local = setup(); await local.click("Review local donation"); local.comment("x".repeat(301));
  await local.click("Confirm local demo"); assert.equal(saved(local.tree), false); noWrites(local.calls);
  const live = setup({ preview: false, joinResult: { ok: true, kind: "launch-subscription", persisted: true } });
  await live.click("Continue to optional signup");
  assert.equal(nodes(live.tree).some(node => node.props.id === "circle-demo-comment" || node.props.id === "circle-demo-anonymous"), false);
  live.email("qa@example.invalid"); live.notify(); await live.submit();
  assert.equal(Object.hasOwn(live.joinPayloads[0] as object, "comment"), false);
  assert.equal(live.calls.writes, 0); assert.equal(live.calls.reads, 0);
});

test("verified Google email needs no manual field and only explicit signup creates a subscription, never a donor badge", async () => {
  const ownerId = "00000000-0000-4000-8000-000000000001";
  const screen = setup({ preview: false, identity: { status: "verified", ownerId, email: "google@example.invalid", source: "google" }, joinResult: { ok: true, kind: "launch-subscription", persisted: true } });
  await screen.click("Continue to optional signup");
  assert.ok(text(screen.tree).includes("Your verified Google emailgoogle@example.invalid"));
  assert.equal(nodes(screen.tree).some(node => node.props.id === "circle-launch-email"), false);
  assert.equal(screen.input("circle-launch-notify").props.checked, false);
  assert.equal(screen.button("Request launch notification").props.disabled, true);
  await screen.submit(); assert.equal(screen.calls.joins, 0);
  screen.notify(); assert.equal(screen.button("Request launch notification").props.disabled, false);
  await screen.submit(2); assert.equal(screen.calls.joins, 1);
  const payload = screen.joinPayloads[0] as Record<string, unknown>;
  assert.equal(payload.expectedOwnerId, ownerId); assert.equal(Object.hasOwn(payload, "email"), false);
  assert.equal(payload.notifyOk, true); assert.equal(payload.marketingOk, false);
  assert.equal(signupDone(screen.tree), true); assert.equal(saved(screen.tree), false);
  assert.match(text(screen.tree), /No donation, Testnet contribution, donor badge or payment receipt was created/);
  assert.equal(screen.calls.writes, 0); assert.equal(screen.calls.network, 0);
});

test("loading and unavailable identity cannot expose a manual fallback or bypass a disabled signup", async () => {
  for (const status of ["loading", "unavailable", "unverified"] as const) {
    const screen = setup({ preview: false, identity: { status }, joinResult: { ok: true, kind: "launch-subscription", persisted: true } });
    await screen.click("Continue to optional signup"); screen.notify();
    assert.equal(nodes(screen.tree).some(node => node.props.id === "circle-launch-email"), false);
    assert.equal(screen.button("Request launch notification").props.disabled, true);
    await screen.submit(); assert.equal(signupDone(screen.tree), false); noWrites(screen.calls);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert"));
  }
});

test("an unconfirmed ok response cannot claim saved subscription or donate to a prototype", async () => {
  for (const joinResult of [{ ok: true }, { ok: true, kind: "donation", persisted: true }, { ok: true, kind: "launch-subscription", persisted: false }]) {
    const screen = setup({ preview: false, joinResult }); await screen.click("Continue to optional signup");
    screen.email("qa@example.invalid"); screen.notify(); await screen.submit();
    assert.equal(signupDone(screen.tree), false); assert.equal(saved(screen.tree), false); assert.equal(screen.calls.joins, 1);
    assert.match(text(screen.tree), /signup result could not be confirmed/); assert.equal(screen.calls.writes, 0);
  }
});
