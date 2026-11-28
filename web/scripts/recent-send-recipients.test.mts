import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

type RecentStore = {
  listRecentSendRecipients(owner: string | null | undefined): string[];
  rememberRecentSendRecipient(owner: string | null | undefined, recipient: string): void;
};

function load(storage: { getItem(key: string): string | null; setItem(key: string, value: string): void }): RecentStore {
  const source = readFileSync(new URL("../lib/ui/recent-send-recipients.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const cjsModule = { exports: {} as RecentStore };
  runInNewContext(code, { module: cjsModule, exports: cjsModule.exports, window: { localStorage: storage } });
  return cjsModule.exports;
}

test("recent recipients are scoped by sender handle, deduplicated and capped at five", () => {
  const values = new Map<string, string>();
  const recent = load({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
  for (const handle of ["ana_01", "ben_02", "car_03", "dan_04", "eve_05", "fox_06"]) recent.rememberRecentSendRecipient("owner_01", handle);
  recent.rememberRecentSendRecipient("owner_01", "CAR_03");
  assert.deepEqual(Array.from(recent.listRecentSendRecipients("owner_01")), ["car_03", "fox_06", "eve_05", "dan_04", "ben_02"]);
  assert.deepEqual(Array.from(recent.listRecentSendRecipients("other_02")), []);
});

test("malformed handles, self-recipient and invalid storage data are ignored", () => {
  const values = new Map<string, string>([["salapi:recent-send-recipients:v1:owner_01", JSON.stringify(["valid_01", "NO SPACE", "x", "valid_01", 7])]]);
  const recent = load({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } });
  assert.deepEqual(Array.from(recent.listRecentSendRecipients("owner_01")), ["valid_01"]);
  recent.rememberRecentSendRecipient("owner_01", "owner_01");
  recent.rememberRecentSendRecipient("owner_01", "bad handle");
  assert.deepEqual(Array.from(recent.listRecentSendRecipients("owner_01")), ["valid_01"]);
});

test("storage errors do not hide a successful transfer or crash recipient display", () => {
  const recent = load({ getItem() { throw Error("storage disabled"); }, setItem() { throw Error("storage disabled"); } });
  assert.deepEqual(Array.from(recent.listRecentSendRecipients("owner_01")), []);
  assert.doesNotThrow(() => recent.rememberRecentSendRecipient("owner_01", "recipient_01"));
});
