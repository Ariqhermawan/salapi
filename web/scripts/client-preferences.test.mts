import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { CURRENCY, localAmount, formatUsdc } from "../lib/ui/currency.ts";

type Element = { type: unknown; props: Record<string, unknown> };
type Fn = (...args: unknown[]) => unknown;
type HookSlot = { value?: unknown; setter?: (value: unknown) => void; deps?: unknown[]; cleanup?: () => void };
type Options = {
  storage?: Record<string, string>;
  cookie?: string;
  denyStorage?: boolean;
  denyReads?: boolean;
  denyWrites?: boolean;
  denyCookieRead?: boolean;
  denyCookieWrite?: boolean;
  reduced?: boolean;
  standalone?: boolean;
  iosStandalone?: boolean;
  noMatchMedia?: boolean;
  legacyMedia?: boolean;
  pathname?: string;
  canInstall?: boolean;
  currency?: string;
  walletState?: () => Promise<{ pesos: number; address: string }>;
  topUp?: () => Promise<{ note: string }>;
};

const files = {
  i18n: "../components/I18nProvider.tsx",
  banner: "../components/InstallBanner.tsx",
  motion: "../components/ui/motion.tsx",
  install: "../hooks/useInstallPrompt.ts",
  wallet: "../components/Wallet.tsx",
};
const codes = Object.fromEntries(Object.entries(files).map(([name, path]) => [name,
  ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
])) as Record<keyof typeof files, string>;
const config = { DEFAULT_LOCALE: "en", LOCALE_COOKIE: "salapi_locale", isLocale: (value: unknown) => ["en", "tl", "id", "vi"].includes(String(value)) };
const dictionaries = { DICTS: { en: { hello: "Hi {name}" }, id: { hello: "Halo {name}" }, tl: {}, vi: {} } };
const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });

// The real components/hooks run in a VM with isolated browser primitives.
// Effects, subscriptions, promise completions and animation frames are explicit.
// No browser, network, credentials, persistent storage or server action runs.
function setup(module: keyof typeof files, options: Options = {}) {
  const slots: HookSlot[] = [];
  // React discards effects from a render restarted by an own-state adjustment.
  // Keep only the latest uncommitted effect for each hook slot.
  const effects = new Map<number, () => void>();
  const transitions: Promise<unknown>[] = [];
  const storage = new Map(Object.entries(options.storage ?? {}));
  const events = new Map<string, Set<Fn>>();
  const media = new Map<string, { matches: boolean; listeners: Set<Fn>; addEventListener?: (type: string, fn: Fn) => void; removeEventListener?: (type: string, fn: Fn) => void; addListener: (fn: Fn) => void; removeListener: (fn: Fn) => void }>();
  const raf = new Map<number, (time: number) => void>();
  const calls = { reads: 0, writes: 0, wallet: 0, topUp: 0, synchronousEffectUpdates: 0, notifications: 0 };
  let cookie = options.cookie ?? "";
  let cursor = 0;
  let dirty = false;
  let inEffect = false;
  let mode: "server" | "hydrate" | "client" = "client";
  let root: () => unknown;
  let tree: unknown;
  let now = 0;
  let nextRaf = 0;
  function sameDeps(a?: unknown[], b?: unknown[]) { return !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])); }
  const hooks = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) {
        slots[index] = { value: typeof initial === "function" ? (initial as () => unknown)() : initial };
        slots[index].setter = (next: unknown) => {
          if (inEffect) { calls.synchronousEffectUpdates++; throw new Error("Synchronous state update in effect"); }
          const value = typeof next === "function" ? (next as (previous: unknown) => unknown)(slots[index].value) : next;
          if (!Object.is(value, slots[index].value)) { slots[index].value = value; dirty = true; }
        };
      }
      return [slots[index].value, slots[index].setter];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
    useEffect(callback: () => void | (() => void), deps?: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (mode === "server" || mode === "hydrate") return;
      if (!previous || !sameDeps(previous.deps, deps)) {
        effects.set(index, () => {
          previous?.cleanup?.();
          const cleanup = callback();
          slots[index] = { deps, cleanup: typeof cleanup === "function" ? cleanup : undefined };
        });
      }
    },
    useSyncExternalStore(subscribe: (notify: () => void) => () => void, getSnapshot: () => unknown, getServerSnapshot: () => unknown) {
      const index = cursor++;
      if (mode === "server" || mode === "hydrate") return getServerSnapshot();
      if (!slots[index]) slots[index] = { cleanup: subscribe(() => { calls.notifications++; dirty = true; }) };
      return getSnapshot();
    },
    useCallback(callback: unknown) { return callback; },
    useMemo(callback: () => unknown) { return callback(); },
    useTransition: () => [false, (action: () => Promise<unknown>) => transitions.push(action())],
    createContext: () => "Context",
    useContext: () => { throw new Error("Unexpected context consumer"); },
  };
  const browser = {
    navigator: { standalone: !!options.iosStandalone },
    addEventListener(name: string, callback: Fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(callback); },
    removeEventListener(name: string, callback: Fn) { events.get(name)?.delete(callback); },
    matchMedia: options.noMatchMedia ? undefined : (query: string) => {
      if (!media.has(query)) {
        const listeners = new Set<Fn>();
        media.set(query, {
          matches: query.includes("reduced-motion") ? !!options.reduced : !!options.standalone,
          listeners,
          ...(options.legacyMedia ? {} : {
            addEventListener: (_: string, callback: Fn) => listeners.add(callback),
            removeEventListener: (_: string, callback: Fn) => listeners.delete(callback),
          }),
          addListener: (callback: Fn) => { listeners.add(callback); },
          removeListener: (callback: Fn) => { listeners.delete(callback); },
        });
      }
      return media.get(query)!;
    },
  };
  const document = {
    documentElement: { lang: "en" },
    get cookie() { if (options.denyCookieRead) throw new Error("Cookie read denied"); return cookie; },
    set cookie(value: string) { if (options.denyCookieWrite) throw new Error("Cookie write denied"); cookie = value; },
  };
  const sandbox = {
    exports: {} as Record<string, Fn>, window: browser, document,
    get localStorage() {
      if (options.denyStorage) throw new Error("Storage access denied");
      return {
        getItem(key: string) { calls.reads++; if (options.denyReads) throw new Error("Read denied"); return storage.get(key) ?? null; },
        setItem(key: string, value: string) { if (options.denyWrites) throw new Error("Write denied"); calls.writes++; storage.set(key, value); },
        removeItem(key: string) { if (options.denyWrites) throw new Error("Write denied"); calls.writes++; storage.delete(key); },
      };
    },
    performance: { now: () => now },
    requestAnimationFrame(callback: (time: number) => void) { const id = ++nextRaf; raf.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { raf.delete(id); },
    require(name: string) {
      if (name === "react") return hooks;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/lib/i18n/config") return config;
      if (name === "@/lib/i18n/dictionaries") return dictionaries;
      if (name === "next/navigation") return { usePathname: () => options.pathname ?? "/send" };
      if (name === "@/hooks/useInstallPrompt") return { useInstallPrompt: () => ({ canInstall: options.canInstall ?? true, promptInstall: async () => "dismissed" }) };
      if (name === "@/components/ui/brand") return { SalapiMark: "SalapiMark" };
      if (name === "@/components/I18nProvider") return { useT: () => ({ t: (key: string) => key, locale: "en", currency: options.currency ?? "tl" }) };
      if (name === "next/link") return { default: "Link" };
      if (name === "@/components/ui/motion") return { CountUp: "CountUp" };
      if (name === "@/lib/ui/currency") return { CURRENCY, localAmount, formatUsdc };
      if (name === "@/app/actions") return {
        walletState() { calls.wallet++; return options.walletState?.() ?? Promise.resolve({ pesos: 123, address: "G-ISOLATED-WALLET" }); },
        topUpSandbox() { calls.topUp++; return options.topUp?.() ?? Promise.resolve({ note: "Isolated sandbox result" }); },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  runInNewContext(codes[module], sandbox);
  function render(nextMode = mode) {
    mode = nextMode;
    let attempts = 0;
    do {
      dirty = false; cursor = 0; tree = root();
      assert.ok(++attempts < 10, "Render state must converge");
    } while (dirty);
    return tree;
  }
  return {
    exports: sandbox.exports, calls, storage, media, events, raf, document,
    get cookie() { return cookie; },
    get tree() { return tree; },
    mount(callback: () => unknown, nextMode: typeof mode = "client") { root = callback; return render(nextMode); },
    render,
    flushEffects() {
      while (effects.size) {
        const [index, callback] = effects.entries().next().value!;
        effects.delete(index); inEffect = true;
        try { callback(); } finally { inEffect = false; }
      }
    },
    async settle() { await Promise.resolve(); await Promise.resolve(); while (transitions.length) await Promise.all(transitions.splice(0)); return render(); },
    event(name: string, event: unknown = {}) { for (const fn of [...events.get(name) ?? []]) fn(event); },
    changeMedia(query: string, matches: boolean) { const value = media.get(query)!; value.matches = matches; for (const fn of [...value.listeners]) fn(); },
    frame(time: number) { now = time; const callbacks = [...raf.values()]; raf.clear(); for (const callback of callbacks) callback(time); return render(); },
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
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
function preferences(runtime: ReturnType<typeof setup>) { return (runtime.tree as Element).props.value as { locale: string; currency: string; currencyPref: string | null; setLocale(value: string): void; setCurrency(value: string | null): void; t(key: string, vars?: Record<string, string>): string }; }
const reducedQuery = "(prefers-reduced-motion: reduce)";
const standaloneQuery = "(display-mode: standalone)";

test("real SSR renders deterministic confetti and CountUp without browser APIs or random render", () => {
  const exports = {} as Record<string, React.ComponentType<Record<string, unknown>>>;
  runInNewContext(codes.motion, {
    exports,
    Math: new Proxy(Math, { get(target, key) { if (key === "random") return () => { throw new Error("Impure render"); }; return Reflect.get(target, key); } }),
    require(name: string) { if (name === "react") return React; if (name === "react/jsx-runtime") return jsxRuntime; throw new Error(name); },
  });
  const confetti = () => renderToStaticMarkup(React.createElement(exports.Confetti, { fire: true }));
  assert.equal(confetti(), confetti());
  assert.equal((confetti().match(/<span/g) ?? []).length, 28);
  assert.match(renderToStaticMarkup(React.createElement(exports.CountUp, { value: 1250, prefix: "P" })), /P1,250/);
});

test("preferences use identical SSR and hydration defaults before reading browser choices", () => {
  const runtime = setup("i18n", { storage: { salapi_locale: "id", salapi_currency: "vi" } });
  runtime.mount(() => runtime.exports.I18nProvider({ children: "Child" }), "server");
  assert.equal(preferences(runtime).locale, "en");
  assert.equal(runtime.calls.reads, 0);
  runtime.render("hydrate");
  assert.equal(preferences(runtime).locale, "en");
  assert.equal(runtime.calls.reads, 0);
  runtime.render("client"); runtime.flushEffects();
  assert.equal(preferences(runtime).locale, "id");
  assert.equal(preferences(runtime).currency, "vi");
  assert.equal(runtime.document.documentElement.lang, "id");
  assert.equal(runtime.calls.writes, 0);
  assert.equal(runtime.calls.synchronousEffectUpdates, 0);
});

test("invalid locale storage falls back to valid cookie without losing separate currency", () => {
  const runtime = setup("i18n", { storage: { salapi_locale: "invalid", salapi_currency: "tl" }, cookie: "x=1;salapi_locale=id" });
  runtime.mount(() => runtime.exports.I18nProvider({ children: null })); runtime.flushEffects();
  assert.equal(preferences(runtime).locale, "id");
  assert.equal(preferences(runtime).currency, "tl");
  assert.equal(preferences(runtime).t("hello", { name: "QA" }), "Halo QA");
});

test("denied storage still restores cookie and independently persists language to cookie", () => {
  const runtime = setup("i18n", { denyStorage: true, cookie: "salapi_locale=tl" });
  runtime.mount(() => runtime.exports.I18nProvider({ children: null })); runtime.flushEffects();
  assert.equal(preferences(runtime).locale, "tl");
  preferences(runtime).setLocale("id"); runtime.render(); runtime.flushEffects();
  assert.equal(preferences(runtime).locale, "id");
  assert.equal(runtime.document.documentElement.lang, "id");
  assert.match(runtime.cookie, /^salapi_locale=id; path=\/; max-age=31536000$/);
  preferences(runtime).setCurrency("vi"); runtime.render();
  assert.equal(preferences(runtime).currency, "vi");
  preferences(runtime).setCurrency(null); runtime.render();
  assert.equal(preferences(runtime).currency, "id");
});

test("cookie denial does not block valid storage or in-memory choices", () => {
  const runtime = setup("i18n", { storage: { salapi_locale: "id" }, denyCookieRead: true, denyCookieWrite: true });
  runtime.mount(() => runtime.exports.I18nProvider({ children: null }));
  assert.equal(preferences(runtime).locale, "id");
  preferences(runtime).setLocale("vi"); runtime.render();
  assert.equal(preferences(runtime).locale, "vi");
  assert.equal(runtime.storage.get("salapi_locale"), "vi");
});

test("language and explicit currency persist separately and Follow language removes its key", () => {
  const runtime = setup("i18n");
  runtime.mount(() => runtime.exports.I18nProvider({ children: null }));
  preferences(runtime).setCurrency("tl"); preferences(runtime).setLocale("id"); runtime.render();
  assert.equal(preferences(runtime).currency, "tl");
  assert.equal(runtime.storage.get("salapi_currency"), "tl");
  assert.equal(runtime.storage.get("salapi_locale"), "id");
  preferences(runtime).setCurrency(null); runtime.render();
  assert.equal(preferences(runtime).currencyPref, null);
  assert.equal(preferences(runtime).currency, "id");
  assert.equal(runtime.storage.has("salapi_currency"), false);
});

test("preference subscriptions accept relevant storage events and clean up", () => {
  const runtime = setup("i18n");
  runtime.mount(() => runtime.exports.I18nProvider({ children: null }));
  runtime.event("storage", { key: "unrelated" }); assert.equal(runtime.calls.notifications, 0);
  runtime.storage.set("salapi_locale", "vi"); runtime.event("storage", { key: "salapi_locale" }); runtime.render();
  assert.equal(preferences(runtime).locale, "vi");
  runtime.event("storage", { key: null }); assert.equal(runtime.calls.notifications, 2);
  runtime.unmount(); assert.equal(runtime.events.get("storage")?.size, 0);
});

test("banner stays hidden in SSR/hydration and respects persisted dismissal and hidden routes", () => {
  const runtime = setup("banner");
  runtime.mount(() => runtime.exports.default(), "server"); assert.equal(runtime.tree, null);
  runtime.render("hydrate"); assert.equal(runtime.tree, null);
  runtime.render("client"); assert.ok(runtime.tree);
  runtime.storage.set("salapi_install_dismissed", "1"); runtime.render(); assert.equal(runtime.tree, null);
  for (const pathname of ["/", "/vaults", "/activity"]) {
    const hidden = setup("banner", { pathname }); hidden.mount(() => hidden.exports.default()); assert.equal(hidden.tree, null);
  }
});

test("banner dismissal works for this visit even when storage getter or writes are denied", () => {
  for (const options of [{ denyStorage: true }, { denyWrites: true }, { denyReads: true }]) {
    const runtime = setup("banner", options); runtime.mount(() => runtime.exports.default());
    const dismiss = nodes(runtime.tree).find(node => node.props["aria-label"] === "install.dismiss")!;
    assert.ok(dismiss); (dismiss.props.onClick as () => void)(); runtime.render();
    assert.equal(runtime.tree, null);
  }
});

test("banner normal dismissal persists its established key", () => {
  const runtime = setup("banner"); runtime.mount(() => runtime.exports.default());
  (nodes(runtime.tree).find(node => node.props["aria-label"] === "install.dismiss")!.props.onClick as () => void)();
  runtime.render(); assert.equal(runtime.storage.get("salapi_install_dismissed"), "1"); assert.equal(runtime.tree, null);
  runtime.unmount(); assert.equal(runtime.events.get("storage")?.size, 0);
});

test("install prompt is single-use and accepted is not falsely called installed", async () => {
  const runtime = setup("install"); runtime.mount(() => runtime.exports.useInstallPrompt()); runtime.flushEffects();
  let prompted = 0; let prevented = 0; let resolvePrompt!: () => void;
  runtime.event("beforeinstallprompt", { preventDefault() { prevented++; }, prompt() { prompted++; return new Promise<void>(resolve => { resolvePrompt = resolve; }); }, userChoice: Promise.resolve({ outcome: "accepted" }) });
  runtime.render();
  type State = { canInstall: boolean; installed: boolean; promptInstall(): Promise<string> };
  const current = runtime.tree as State; assert.equal(current.canInstall, true);
  const pending = current.promptInstall();
  assert.equal(await current.promptInstall(), "unavailable");
  assert.equal(prompted, 1); assert.equal(prevented, 1);
  resolvePrompt(); assert.equal(await pending, "accepted"); runtime.render();
  assert.equal((runtime.tree as State).canInstall, false); assert.equal((runtime.tree as State).installed, false);
  runtime.event("appinstalled"); runtime.render(); runtime.flushEffects();
  assert.equal((runtime.tree as State).installed, true);
  runtime.unmount(); assert.equal(runtime.events.get("beforeinstallprompt")?.size, 0); assert.equal(runtime.events.get("appinstalled")?.size, 0);
});

test("rejected or dismissed install prompts resolve safely and cannot reuse their event", async () => {
  for (const reject of [true, false]) {
    const runtime = setup("install"); runtime.mount(() => runtime.exports.useInstallPrompt()); runtime.flushEffects();
    runtime.event("beforeinstallprompt", { preventDefault() {}, prompt: async () => { if (reject) throw new Error("Denied prompt"); }, userChoice: Promise.resolve({ outcome: "dismissed" }) }); runtime.render();
    const state = runtime.tree as { promptInstall(): Promise<string> };
    assert.equal(await state.promptInstall(), reject ? "unavailable" : "dismissed"); runtime.render();
    assert.equal(await (runtime.tree as typeof state).promptInstall(), "unavailable");
  }
});

test("standalone browser and iOS installs use SSR-safe snapshots without effect state writes", () => {
  for (const options of [{ standalone: true }, { iosStandalone: true }, { iosStandalone: true, noMatchMedia: true }]) {
    const runtime = setup("install", options); runtime.mount(() => runtime.exports.useInstallPrompt(), "server");
    assert.equal((runtime.tree as { installed: boolean }).installed, false);
    runtime.render("hydrate"); assert.equal((runtime.tree as { installed: boolean }).installed, false);
    runtime.render("client"); runtime.flushEffects(); assert.equal((runtime.tree as { installed: boolean }).installed, true);
    runtime.event("beforeinstallprompt", { preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: "accepted" }) }); runtime.render();
    assert.equal((runtime.tree as { canInstall: boolean }).canInstall, false);
    assert.equal(runtime.calls.synchronousEffectUpdates, 0);
  }
  const runtime = setup("install"); runtime.mount(() => runtime.exports.useInstallPrompt()); runtime.flushEffects();
  runtime.changeMedia(standaloneQuery, true); runtime.render(); assert.equal((runtime.tree as { installed: boolean }).installed, true);
});

test("reduced-motion subscriptions work with modern, legacy and absent matchMedia", () => {
  for (const legacyMedia of [true, false]) {
    const runtime = setup("motion", { reduced: true, legacyMedia }); runtime.mount(() => runtime.exports.useReducedMotion(), "server"); assert.equal(runtime.tree, false);
    runtime.render("client"); assert.equal(runtime.tree, true);
    runtime.changeMedia(reducedQuery, false); runtime.render(); assert.equal(runtime.tree, false);
    runtime.unmount(); assert.equal(runtime.media.get(reducedQuery)?.listeners.size, 0);
  }
  const runtime = setup("motion", { noMatchMedia: true }); runtime.mount(() => runtime.exports.useReducedMotion()); assert.equal(runtime.tree, false);
});

test("CountUp shows current reduced-motion money immediately and never flashes stale value after toggle", () => {
  let value = 100;
  const runtime = setup("motion", { reduced: true }); runtime.mount(() => runtime.exports.CountUp({ value, prefix: "P" })); runtime.flushEffects();
  value = 1000; runtime.render(); runtime.flushEffects(); assert.equal(text(runtime.tree), "P1,000");
  runtime.changeMedia(reducedQuery, false); runtime.render(); runtime.flushEffects(); assert.equal(text(runtime.tree), "P1,000");
  runtime.frame(350); assert.equal(text(runtime.tree), "P1,000");
  assert.equal(runtime.calls.synchronousEffectUpdates, 0); runtime.unmount(); assert.equal(runtime.raf.size, 0);
});

test("CountUp continues interrupted animations from displayed money and handles zero duration", () => {
  let value = 0; let duration = 1000;
  const runtime = setup("motion"); runtime.mount(() => runtime.exports.CountUp({ value, duration })); runtime.flushEffects();
  value = 100; runtime.render(); runtime.flushEffects(); runtime.frame(500); assert.equal(text(runtime.tree), "88");
  value = 200; runtime.render(); runtime.flushEffects(); runtime.frame(500); assert.equal(text(runtime.tree), "88");
  runtime.frame(1500); assert.equal(text(runtime.tree), "200");
  duration = 0; value = 900; runtime.render(); runtime.flushEffects(); assert.equal(text(runtime.tree), "900");
  duration = 1000; runtime.render(); runtime.flushEffects(); assert.equal(text(runtime.tree), "900");
  runtime.unmount(); assert.equal(runtime.raf.size, 0);
});

test("wallet load failure is handled and never triggers a top-up", async () => {
  const runtime = setup("wallet", { walletState: async () => { throw new Error("Isolated wallet failure"); } });
  runtime.mount(() => runtime.exports.default()); runtime.flushEffects(); await runtime.settle();
  assert.match(text(runtime.tree), /wallet could not be loaded/);
  assert.equal(runtime.calls.topUp, 0); assert.equal(runtime.calls.synchronousEffectUpdates, 0);
});

test("wallet ignores late unmounted loads and uses the explicit display currency", async () => {
  let resolveWallet!: (value: { pesos: number; address: string }) => void;
  const runtime = setup("wallet", { currency: "id", walletState: () => new Promise(resolve => { resolveWallet = resolve; }) });
  runtime.mount(() => runtime.exports.default()); runtime.flushEffects(); runtime.unmount();
  resolveWallet({ pesos: 500, address: "G-LATE" }); await runtime.settle();
  const count = nodes(runtime.tree).find(node => node.type === "CountUp")!;
  assert.equal(count.props.value, 0); assert.equal(count.props.prefix, CURRENCY.id.symbol);
  const loaded = setup("wallet", { currency: "id" }); loaded.mount(() => loaded.exports.default()); loaded.flushEffects(); await loaded.settle();
  assert.equal(nodes(loaded.tree).find(node => node.type === "CountUp")!.props.value, localAmount(123, "id"));
});

test("wallet sandbox rejection is caught and preserves the previously loaded balance", async () => {
  const runtime = setup("wallet", { topUp: async () => { throw new Error("Isolated top-up failure"); } });
  runtime.mount(() => runtime.exports.default()); runtime.flushEffects(); await runtime.settle();
  const button = nodes(runtime.tree).find(node => node.type === "button")!; (button.props.onClick as () => void)(); await runtime.settle();
  assert.equal(runtime.calls.topUp, 1);
  assert.match(text(runtime.tree), /wallet could not be refreshed/);
  assert.equal(nodes(runtime.tree).find(node => node.type === "CountUp")!.props.value, 123);
});
