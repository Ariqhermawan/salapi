import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { formatStroops } from "../lib/format-stroops.ts";

type Element = { type: unknown; props: Record<string, unknown> };
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const compile = (path: string) => ts.transpileModule(source(path), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}

test("exact formatter has no SDK, provider, auth or other runtime imports", () => {
  assert.doesNotMatch(source("../lib/format-stroops.ts"), /^\s*import\b/m);
  const exports = {} as { formatStroops(value: string | bigint): string };
  runInNewContext(compile("../lib/format-stroops.ts"), {
    exports, require(name: string) { throw Error(`Formatter cannot load a runtime dependency: ${name}`); },
  });
  for (const [input, output] of [
    ["0", "0"], ["1", "0.0000001"], ["10000000", "1"], ["10000001", "1.0000001"],
    ["500000000", "50"], ["100000000000001", "10000000.0000001"],
    ["170141183460469231731687303715884105727", "17014118346046923173168730371588.4105727"],
  ]) {
    assert.equal(formatStroops(input), output);
    assert.equal(exports.formatStroops(BigInt(input)), output);
  }
});

test("display-only UI imports the pure formatter instead of the SDK-backed validator", () => {
  for (const path of [
    "../app/page.tsx", "../components/screens/VaultsScreen.tsx", "../components/screens/CampaignScreen.tsx",
    "../components/screens/TransparencyScreen.tsx", "../components/CircleTestnetDonate.tsx",
  ]) {
    const code = source(path);
    assert.match(code, /import \{ formatStroops \} from "@\/lib\/format-stroops";/, path);
    assert.doesNotMatch(code, /import \{[^}]*formatStroops[^}]*\} from "@\/lib\/disaster";/, path);
  }
  assert.match(source("../lib/disaster.ts"), /export \{ formatStroops \} from "\.\/format-stroops\.ts";/);
  assert.match(source("../lib/disaster.ts"), /StrKey\.isValidEd25519PublicKey/, "The transaction validator is not weakened");
});

function mountNavigation(initialPath = "/") {
  let path = initialPath;
  const pushes: string[] = [], prefetched: string[] = [];
  const invalidations = new Map<string, () => void>();
  const ref = { current: new Set<string>() };
  const exports = {} as { default(): Element | null };
  runInNewContext(compile("../components/BottomNav.tsx"), {
    exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react") return { useRef: () => ref };
      if (name === "next/navigation") return {
        usePathname: () => path,
        useRouter: () => ({ push: (id: string) => pushes.push(id), prefetch: (id: string, options: { kind: string; onInvalidate(): void }) => { assert.equal(options.kind, "auto"); prefetched.push(id); invalidations.set(id, options.onInvalidate); } }),
      };
      if (name === "@/components/ui/kit") return { TabBar: "TabBar", Ico: new Proxy({}, { get: () => () => null }) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ t: (key: string) => key }) };
      throw Error(`Unexpected navigation dependency: ${name}`);
    },
  });
  return { render: () => exports.default(), pushes, prefetched, invalidations, setPath: (next: string) => { path = next; } };
}

test("tab prefetch follows intent only, deduplicates, refreshes after invalidation and rejects unknown targets", () => {
  const ui = mountNavigation();
  const tree = ui.render()!;
  assert.equal(tree.type, "TabBar");
  assert.deepEqual(ui.prefetched, [], "Mounting navigation must not fan out five route requests");
  const prefetch = tree.props.onPrefetch as (id: string) => void;
  prefetch("/"); prefetch("https://evil.invalid"); prefetch("/api/wallet");
  assert.deepEqual(ui.prefetched, []);
  prefetch("/vaults"); prefetch("/vaults"); prefetch("/vaults");
  assert.deepEqual(ui.prefetched, ["/vaults"]);
  ui.invalidations.get("/vaults")!(); prefetch("/vaults");
  assert.deepEqual(ui.prefetched, ["/vaults", "/vaults"]);
  for (const id of ["/send", "/activity", "/settings"]) prefetch(id);
  assert.deepEqual(ui.prefetched.slice(2), ["/send", "/activity", "/settings"]);
  (tree.props.onNav as (id: string) => void)("/");
  assert.deepEqual(ui.pushes, [], "Clicking the current tab must not remount its reads");
  (tree.props.onNav as (id: string) => void)("/send");
  assert.deepEqual(ui.pushes, ["/send"]);
});

test("standalone auth/docs/offline routes keep navigation and speculative tab requests absent", () => {
  for (const path of ["/signin", "/onboarding", "/offline", "/docs", "/docs/faq"]) {
    const ui = mountNavigation(path);
    assert.equal(ui.render(), null);
    assert.deepEqual(ui.prefetched, []);
  }
});

test("every actual TabBar button exposes pointer, touch-pointer and keyboard intent without changing click semantics", () => {
  const exports = {} as { TabBar(props: Record<string, unknown>): Element };
  runInNewContext(compile("../components/ui/kit.tsx"), {
    exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/lib/ui/tokens") return { T: { action: "blue", slate: "gray", surface: "white", hairline: "gray", fontSans: "sans-serif" } };
      if (name === "@/components/ui/icons") return { Ico: {} };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "en" }) };
      if (name === "@/lib/ui/currency") return { formatParts() {}, formatUsdc() {} };
      if (name === "@/components/ui/brand") return {};
      throw Error(`Unexpected TabBar dependency: ${name}`);
    },
  });
  const intents: string[] = [], clicks: string[] = [];
  const items = ["/", "/vaults", "/send", "/activity", "/settings"].map(id => ({ id, label: id, icon: () => null, fab: id === "/send" }));
  const tree = exports.TabBar({ active: "/send", items, onPrefetch: (id: string) => intents.push(id), onNav: (id: string) => clicks.push(id) });
  const buttons = nodes(tree).filter(element => element.type === "button");
  assert.equal(buttons.length, 5);
  for (const [index, button] of buttons.entries()) {
    assert.equal(button.props.type, "button");
    assert.equal((button.props.style as { height: number }).height, 52);
    for (const event of ["onPointerEnter", "onFocus", "onPointerDown"]) (button.props[event] as () => void)();
    (button.props.onClick as () => void)();
    assert.deepEqual(intents.slice(index * 3, index * 3 + 3), Array(3).fill(items[index].id));
  }
  assert.deepEqual(clicks, items.map(item => item.id));
  assert.equal(buttons[2].props["aria-current"], "page");
  assert.equal(buttons[2].props["aria-label"], "/send");
});

test("route loading fallback remains a neutral screen, not an account or financial cache", () => {
  const exports = {} as { default(): Element };
  runInNewContext(compile("../app/loading.tsx"), {
    exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      throw Error(`Loading fallback cannot read services: ${name}`);
    },
  });
  const tree = exports.default();
  assert.equal(tree.props.role, "status");
  assert.equal(tree.props["aria-live"], "polite");
  assert.equal(tree.props["data-testid"], "route-loading");
  assert.equal(nodes(tree).filter(node => node.props.className === "sl-skel").length, 3);
  assert.equal(nodes(tree).filter(node => ["button", "a", "input", "form"].includes(String(node.type))).length, 0);
});
