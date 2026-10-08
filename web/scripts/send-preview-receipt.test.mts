import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as revampMoney from "../lib/i18n/revamp-money.ts";
import { localToStroops, pesosToStroopsExact } from "../lib/money.ts";
import { CURRENCY, formatLocalAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import * as recipientReview from "../lib/recipient-review.ts";
import type { PreviewTransferInput } from "../lib/local-preview-history.ts";

type Element = { type: string; props: Record<string, unknown> };
type History = { recordPreviewTransfer(input: PreviewTransferInput): unknown };
const wallet = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
const recipient = "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H";

function compile(path: string, jsx = false) {
  return ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    },
  }).outputText;
}
const componentCode = compile("../components/screens/SendScreen.tsx", true);
const historyCode = compile("../lib/local-preview-history.ts");

// Execute the real component handlers and receipt writer with isolated hooks,
// JSX nodes, and in-memory storage. Server actions and navigation are stubs;
// these tests never launch a browser, access credentials, or contact a network.
function setup(options: { preview?: boolean; storageUnavailable?: boolean } = {}) {
  const preview = options.preview ?? true;
  const storage = new Map<string, string>();
  const calls = { writes: 0, records: 0, lookups: 0, transfers: 0 };
  const localPreview = { isLocalPreview: preview, PREVIEW_WALLET: { address: wallet, handle: "ariqhermawan" } };
  const history = {} as History;
  runInNewContext(historyCode, {
    exports: history,
    window: {},
    crypto: { randomUUID: () => "isolated-test-receipt" },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem(key: string, value: string) {
        if (options.storageUnavailable) throw new Error("Storage unavailable");
        calls.writes++;
        storage.set(key, value);
      },
    },
    require: (name: string) => {
      assert.equal(name, "./local-preview");
      return localPreview;
    },
  });

  const state: unknown[] = [];
  let cursor = 0;
  const transitions: Promise<unknown>[] = [];
  const component = {} as { default(props: { initialTo: string }): Element };
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const icons = new Proxy({}, { get: () => () => null });
  const ui = Object.fromEntries(["AppBar", "IconButton", "Card", "Row", "Btn", "Chip", "Avatar", "PoweredByStellar"].map(name => [name, name]));
  runInNewContext(componentCode, {
    exports: component,
    require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "@/lib/i18n/revamp-money") return revampMoney;
      if (name === "@/lib/recipient-review") return recipientReview;
      if (name === "@/components/AccountAvatar") return { default: "AccountAvatar" };
      if (name === "@/components/useAccountPhoto") return { useAccountPhoto: () => ({ profile: null }) };
      if (name === "react") return {
        useState(initial: unknown) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value: unknown) => {
            state[index] = typeof value === "function" ? value(state[index]) : value;
          }];
        },
        useRef(initial: unknown) {
          const index = cursor++;
          if (!(index in state)) state[index] = { current: initial };
          return state[index];
        },
        useEffect() {},
        useTransition: () => [false, (action: () => Promise<unknown>) => transitions.push(action())],
      };
      if (name === "next/navigation") return { useRouter: () => ({ push() {} }) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ currency: "tl", t: (key: string) => key }) };
      if (name === "@/components/ui/kit") return { ...ui, T: {}, Ico: icons };
      if (name === "@/components/ui/SuccessMotion") return { default: "SuccessMotion" };
      if (name === "@/components/ui/TransferMotion") return { default: "TransferMotion" };
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => {} };
      if (name === "@/lib/ui/currency") return { CURRENCY, formatLocalAmount, pesoFromLocal };
      if (name === "@/lib/money") return { localToStroops, pesosToStroopsExact };
      if (name === "@/lib/local-preview") return localPreview;
      if (name === "./SendRevamp.module.css") return { default: {} };
      if (name === "@/lib/local-preview-history") return {
        recordPreviewTransfer(input: PreviewTransferInput) {
          calls.records++;
          return history.recordPreviewTransfer(input);
        },
      };
      if (name === "@/app/actions") return {
        myHandle: async () => null,
        registerUsername: async () => { throw new Error("Unexpected username write"); },
        lookupRecipient: async (username: string) => {
          calls.lookups++;
          return { ok: true, username, address: recipient };
        },
        sendByUsername: async () => {
          assert.equal(preview, false, "A local confirmation must never invoke a transfer");
          calls.transfers++;
          return { ok: true, to: recipient, link: "https://stellar.expert/explorer/testnet/tx/test-server-receipt" };
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const render = () => { cursor = 0; return component.default({ initialTo: "jamamam" }); };
  let tree = render();
  return {
    calls, storage,
    get tree() { return tree; },
    amount(value: string) {
      const input = nodes(tree).find(node => node.props.id === "send-amount")!;
      (input.props.onChange as (event: unknown) => void)({ target: { value } });
      tree = render();
    },
    async click(label: string) {
      const button = nodes(tree).find(node => node.type === "Btn" && text(node) === label);
      assert.ok(button, `Missing button: ${label}`);
      (button.props.onClick as () => void)();
      while (transitions.length) await Promise.all(transitions.splice(0));
      tree = render();
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
function hasButton(tree: Element, label: string) {
  return nodes(tree).some(node => node.type === "Btn" && text(node) === label);
}

test("editing and recipient review do not write; explicit local confirmation saves one receipt", async () => {
  const screen = setup();
  assert.equal(screen.calls.writes, 0);
  screen.amount("100");
  assert.equal(screen.calls.records, 0);
  await screen.click("Review transfer");
  assert.equal(screen.calls.lookups, 1);
  assert.equal(screen.calls.writes, 0);
  assert.equal(hasButton(screen.tree, "View local Activity"), false);
  await screen.click("Confirm local demo");
  assert.deepEqual(screen.calls, { writes: 1, records: 1, lookups: 1, transfers: 0 });
  assert.equal(screen.storage.size, 1);
  assert.equal(hasButton(screen.tree, "View local Activity"), true);
  assert.equal(nodes(screen.tree).some(node => node.type === "a" && node.props.href), false);
});

test("failed persistence explains missing Activity and Send again clears that alert", async () => {
  const screen = setup({ storageUnavailable: true });
  screen.amount("100");
  await screen.click("Review transfer");
  await screen.click("Confirm local demo");
  assert.equal(screen.calls.records, 1);
  assert.equal(screen.calls.writes, 0);
  assert.equal(hasButton(screen.tree, "View local Activity"), false);
  assert.ok(nodes(screen.tree).some(node => node.props.role === "alert" && /will not appear in Activity/.test(text(node))));
  await screen.click("Send again");
  assert.equal(nodes(screen.tree).some(node => node.props.role === "alert"), false);
});

test("oversize PHP values disable review, including a decimal lost by Number rounding", async () => {
  for (const amount of ["1000000001", "1000000000.00000005", "1e309"]) {
    const screen = setup();
    screen.amount(amount);
    const review = nodes(screen.tree).find(node => node.type === "Btn" && text(node) === "Review transfer")!;
    assert.equal(review.props.disabled, true, `Must disable review for ${amount}`);
    await screen.click("Review transfer");
    assert.equal(screen.calls.lookups, 0);
    assert.equal(screen.calls.records, 0);
    assert.ok(nodes(screen.tree).some(node => node.props.role === "alert" && /safety limit/.test(text(node))));
  }
});

test("the exact PHP maximum remains usable", async () => {
  const screen = setup();
  screen.amount("1000000000");
  const review = nodes(screen.tree).find(node => node.type === "Btn" && text(node) === "Review transfer")!;
  assert.equal(review.props.disabled, false);
  await screen.click("Review transfer");
  await screen.click("Confirm local demo");
  assert.equal(screen.calls.writes, 1);
  assert.equal(hasButton(screen.tree, "View local Activity"), true);
});

test("real mode confirms through the server action without local receipt writes", async () => {
  const screen = setup({ preview: false });
  screen.amount("100");
  await screen.click("Review transfer");
  await screen.click("Confirm Testnet transfer");
  assert.deepEqual(screen.calls, { writes: 0, records: 0, lookups: 1, transfers: 1 });
  assert.equal(screen.storage.size, 0);
  assert.equal(hasButton(screen.tree, "View local Activity"), false);
});
