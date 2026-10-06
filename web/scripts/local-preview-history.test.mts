import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type {
  PreviewTransfer,
  PreviewTransferInput,
} from "../lib/local-preview-history.ts";
import { localAmount, pesoFromLocal } from "../lib/ui/currency.ts";
import { localToStroops } from "../lib/money.ts";

const wallet = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
const recipient = "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H";
const key = `salapi.preview.transfers.v1.${wallet}`;
const source = readFileSync(
  new URL("../lib/local-preview-history.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
type Api = {
  listPreviewTransfers(): PreviewTransfer[];
  recordPreviewTransfer(input: PreviewTransferInput): PreviewTransfer | null;
};

// Browser storage stays in an isolated VM. Tests never seed the app's actual
// session, execute server actions, submit transactions, or read customer data.
function setup(
  options: {
    preview?: boolean;
    browser?: boolean;
    disabledStorage?: boolean;
  } = {},
) {
  const memory = new Map<string, string>();
  const calls = { get: 0, set: 0 };
  const api = {} as Api;
  const storage = {
    getItem(storageKey: string) {
      calls.get++;
      if (options.disabledStorage) throw Error("disabled");
      return memory.get(storageKey) ?? null;
    },
    setItem(storageKey: string, value: string) {
      calls.set++;
      if (options.disabledStorage) throw Error("disabled");
      memory.set(storageKey, value);
    },
  };
  runInNewContext(code, {
    exports: api,
    require(name: string) {
      assert.equal(name, "./local-preview");
      return {
        isLocalPreview: options.preview ?? true,
        PREVIEW_WALLET: { address: wallet },
      };
    },
    window: options.browser === false ? undefined : {},
    sessionStorage: storage,
    crypto: { randomUUID },
  });
  return { api, memory, calls };
}
const valid: PreviewTransferInput = {
  recipientHandle: "jamamam",
  recipientAddress: recipient,
  pesos: 116,
  amountStroops: "1784615385",
};
const normalize = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

test("Activity starts empty without invented or network receipts", () => {
  const { api, memory } = setup();
  assert.equal(api.listPreviewTransfers().length, 0);
  assert.equal(memory.size, 0);
});

test("Activity keeps its history-aware Back control alongside the revamp tabs", () => {
  const source = readFileSync(new URL("../components/screens/ActivityScreen.tsx", import.meta.url), "utf8");
  assert.match(source, /const goBack = useGoBack\("\/"\)/);
  assert.match(source, /<IconButton ariaLabel=\{m\("Back"\)\} onClick=\{goBack\}/);
  assert.match(source, /role="tablist" aria-label=\{m\("Activity source"\)\}/);
});
test("only an explicit local confirmation creates one versioned wallet-scoped receipt", () => {
  const { api, memory } = setup();
  const receipt = api.recordPreviewTransfer(valid)!;
  assert.ok(receipt.id.startsWith("local-send-"));
  assert.ok(Number.isFinite(Date.parse(receipt.createdAt)));
  assert.equal(receipt.senderAddress, wallet);
  assert.deepEqual(normalize(api.listPreviewTransfers()), [normalize(receipt)]);
  assert.deepEqual([...memory.keys()], [key]);
  assert.equal(JSON.parse(memory.get(key)!).version, 1);
});
test("records minimal demo metadata and never a fake hash or explorer link", () => {
  const { api } = setup();
  const receipt = api.recordPreviewTransfer({
    ...valid,
    hash: "do-not-save",
    link: "do-not-save",
    privateNote: "do-not-save",
  } as PreviewTransferInput)!;
  assert.deepEqual(
    Object.keys(receipt).sort(),
    [
      "amountStroops",
      "createdAt",
      "id",
      "pesos",
      "recipientAddress",
      "recipientHandle",
      "senderAddress",
    ].sort(),
  );
});
test("rejects the same wallet as sender and recipient", () => {
  const { api } = setup();
  assert.equal(
    api.recordPreviewTransfer({ ...valid, recipientAddress: wallet }),
    null,
  );
});
test("rejects malformed usernames, recipient addresses and missing input", () => {
  const { api } = setup();
  assert.equal(
    api.recordPreviewTransfer({ ...valid, recipientHandle: "@jamamam" }),
    null,
  );
  assert.equal(
    api.recordPreviewTransfer({ ...valid, recipientAddress: "not-a-wallet" }),
    null,
  );
  assert.equal(
    api.recordPreviewTransfer(null as unknown as PreviewTransferInput),
    null,
  );
});
test("rejects zero, negative, non-integer and overflowing native units", () => {
  const { api } = setup();
  for (const amountStroops of ["0", "-1", "1.5", "NaN", String(1n << 127n)])
    assert.equal(api.recordPreviewTransfer({ ...valid, amountStroops }), null);
});
test("rejects invalid illustrative money values", () => {
  const { api } = setup();
  for (const pesos of [NaN, Infinity, -1, 1_000_000_001])
    assert.equal(api.recordPreviewTransfer({ ...valid, pesos }), null);
});
test("non-preview mode performs no storage reads or writes", () => {
  const { api, memory, calls } = setup({ preview: false });
  assert.equal(api.recordPreviewTransfer(valid), null);
  assert.equal(api.listPreviewTransfers().length, 0);
  assert.equal(memory.size, 0);
  assert.deepEqual(calls, { get: 0, set: 0 });
});
test("server rendering performs no browser storage reads or writes", () => {
  const { api, memory, calls } = setup({ browser: false });
  assert.equal(api.recordPreviewTransfer(valid), null);
  assert.equal(api.listPreviewTransfers().length, 0);
  assert.equal(memory.size, 0);
  assert.deepEqual(calls, { get: 0, set: 0 });
});
test("does not load an incompatible storage schema", () => {
  const { api, memory } = setup();
  const receipt = api.recordPreviewTransfer(valid);
  memory.set(key, JSON.stringify({ version: 99, transfers: [receipt] }));
  assert.equal(api.listPreviewTransfers().length, 0);
});
test("malformed JSON cannot crash Activity", () => {
  const { api, memory } = setup();
  memory.set(key, "broken-json");
  assert.equal(api.listPreviewTransfers().length, 0);
});
test("filters another wallet's data and invalid timestamps", () => {
  const { api, memory } = setup();
  const receipt = api.recordPreviewTransfer(valid)!;
  memory.set(
    key,
    JSON.stringify({
      version: 1,
      transfers: [
        receipt,
        { ...receipt, senderAddress: recipient },
        { ...receipt, createdAt: "invalid-date" },
      ],
    }),
  );
  assert.deepEqual(normalize(api.listPreviewTransfers()), [normalize(receipt)]);
  memory.clear();
  memory.set(
    `salapi.preview.transfers.v1.${recipient}`,
    JSON.stringify({ version: 1, transfers: [receipt] }),
  );
  assert.equal(api.listPreviewTransfers().length, 0);
});
test("disabled storage does not claim a saved receipt", () => {
  const { api } = setup({ disabledStorage: true });
  assert.equal(api.listPreviewTransfers().length, 0);
  assert.equal(api.recordPreviewTransfer(valid), null);
});
test("caps history at 50 independently identified local demos", () => {
  const { api } = setup();
  for (let i = 0; i < 60; i++) api.recordPreviewTransfer(valid);
  const rows = api.listPreviewTransfers();
  assert.equal(rows.length, 50);
  assert.equal(new Set(rows.map((row) => row.id)).size, 50);
});
test("Send display currency round-trips while exact native units are preserved", () => {
  const { api } = setup();
  const examples = [
    ["en", 2],
    ["tl", 100],
    ["id", 100000],
    ["vi", 250000],
  ] as const;
  for (const [locale, amount] of examples) {
    const pesos = pesoFromLocal(amount, locale);
    const amountStroops = localToStroops(String(amount), locale)!.toString();
    const receipt = api.recordPreviewTransfer({
      ...valid,
      pesos,
      amountStroops,
    })!;
    assert.ok(Math.abs(localAmount(receipt.pesos, locale) - amount) < 1e-6);
    assert.equal(receipt.amountStroops, amountStroops);
  }
});
