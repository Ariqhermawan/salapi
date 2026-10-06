import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as money from "../lib/money.ts";
import * as accountCopy from "../lib/i18n/revamp-account.ts";

type Result = { ok: boolean; pending?: boolean; hash?: string; link?: string; error?: string };
type Actions = Record<string, (...args: unknown[]) => Promise<Result>>;
const hash = "a".repeat(64);
const compile = (path: string, jsx = false) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText;
const codes = { disaster: compile("../app/disaster-actions.ts"), campaign: compile("../app/campaign-actions.ts") };

// Only the actual forwarding wrappers run. SDK, auth and RPC are isolated.
// Money/config validation has independent suites; no transaction is submitted.
function setup(feature: keyof typeof codes, options: { preview?: boolean; result?: Result; authFail?: boolean } = {}) {
  const calls = { auth: 0, reads: 0, invokes: 0, rpc: 0 };
  const sandboxModule = { exports: {} as Actions };
  const sc = new Proxy({}, { get: () => (value: unknown) => value });
  const dependencies = {
    "@stellar/stellar-sdk": { nativeToScVal: (value: unknown) => value, scValToNative: (value: unknown) => value, xdr: { ScVal: { scvVec: (value: unknown) => value } }, rpc: { Server: class { constructor() { calls.rpc++; throw new Error("No provider request authorized"); } } } },
    "@/lib/local-preview": { isLocalPreview: options.preview ?? false },
    "@/lib/server/stellar": { sc, CONTRACTS: { tokenXlmSac: "test-token" }, RPC_URL: "https://isolated.invalid", disasterId: () => "d3", donationCampaignId: () => "d4", txLink: (value: string) => `https://stellar.expert/explorer/testnet/tx/${value}`, stroopsToPesos: () => 5, fmtPeso: () => "PHP 5",
      readContract: async (_id: string, method: string) => { calls.reads++; if (method === "version") return feature === "disaster" ? 3 : 4; if (method === "config") return { signers: ["wallet-a", "wallet-b", "wallet-c"], token: "test-token", cap_bps: 2000, timelock_ledgers: 20 }; if (method === "token") return "test-token"; if (method === "clock") return 1000n; if (method === "campaign") return { config: { creator: "wallet-a" } }; throw new Error(`Unexpected contract read ${method}`); },
      invokeAs: async () => { calls.invokes++; return options.result ?? { ok: false, pending: true, hash, error: "Submitted status is unknown" }; } },
    "@/lib/server/userWallet": { currentWalletPublicKey: async () => null, getSigner: async () => { calls.auth++; if (options.authFail) throw new Error("Auth denied"); return { publicKey: "wallet-a", secret: "isolated-not-a-secret", demo: false }; }, getAuthenticatedSigner: async () => { calls.auth++; if (options.authFail) throw new Error("Auth denied"); return { publicKey: "wallet-a", secret: "isolated-not-a-secret", demo: false }; }, prepareAuthenticatedWallet: async () => { calls.auth++; if (options.authFail) throw new Error("Auth denied"); return { publicKey: "wallet-a", secret: "isolated-not-a-secret", demo: false }; } },
    "@/lib/money": money,
    "@/lib/disaster": { disasterError: (value: string) => value, disasterProposalId: () => 1n, parseDisasterAction: () => ["Pause"], requireDisasterMembership: () => {} },
    "@/lib/campaign-money": { campaignAmount: () => 10n },
    "@/lib/campaign": { campaignId: () => 1n, campaignError: (error: unknown) => error instanceof Error ? error.message : String(error), campaignStruct: (value: unknown) => value, parseCampaignConfig: () => ({ beneficiary: "recipient", cutBps: 500n, funding: 2000n, review: 3000n, approvers: ["a", "b", "c"], title: "Example" }), proofHash: () => hash, publicProofUrl: (value: string) => value },
  };
  runInNewContext(codes[feature], { module: sandboxModule, exports: sandboxModule.exports, Buffer, require: (name: string) => { assert.ok(name in dependencies, `Unexpected ${name}`); return dependencies[name as keyof typeof dependencies]; }, fetch: () => { throw new Error("No network request authorized"); } });
  return { api: sandboxModule.exports, calls };
}
const mutations = {
  disaster: [["disasterContribute", { amount: "5", currency: "tl" }], ["disasterPropose", { kind: "Pause" }], ["disasterApprove", "1"], ["disasterExecute", "1"]],
  campaign: [["campaignCreate", {}], ["campaignDonate", "1", { amount: "5", currency: "tl" }], ["campaignSubmitProof", "1", hash, "https://example.com/proof"], ["campaignApprove", "1", hash], ["campaignRelease", "1"], ["campaignRefund", "1"], ["campaignCloseEmpty", "1"]],
} as const;

for (const feature of ["disaster", "campaign"] as const) {
  test(`${feature}: every pending wrapper preserves hash/error without announcing success`, async () => {
    for (const [method, ...args] of mutations[feature]) {
      const env = setup(feature); const result = await env.api[method](...args);
      assert.equal(result.ok, false, method); assert.equal(result.pending, true, method); assert.equal(result.hash, hash, method); assert.equal(result.error, "Submitted status is unknown"); assert.ok(result.link?.endsWith(hash)); assert.equal(env.calls.invokes, 1, method);
    }
  });
  test(`${feature}: definitive failures remain definitive and authenticated signer failures never invoke`, async () => {
    for (const [method, ...args] of mutations[feature]) {
      const failed = setup(feature, { result: { ok: false, error: "Definitive failure" } }); const result = await failed.api[method](...args); assert.equal(result.ok, false); assert.notEqual(result.pending, true); assert.equal(result.hash, undefined);
      const denied = setup(feature, { authFail: true }); assert.equal((await denied.api[method](...args)).ok, false); assert.equal(denied.calls.invokes, 0);
    }
  });
  test(`${feature}: local preview denies all reads and submissions before auth/RPC`, async () => {
    const env = setup(feature, { preview: true });
    for (const [method, ...args] of mutations[feature]) assert.equal((await env.api[method](...args)).ok, false, method);
    const reads = feature === "disaster" ? ["disasterState", "disasterProposals", "disasterEvents"] : ["campaignState", "campaignEvents"];
    for (const method of reads) assert.equal((await env.api[method]()).ok, false, method);
    assert.deepEqual(env.calls, { auth: 0, reads: 0, invokes: 0, rpc: 0 });
  });
}

test("actual CampaignScreen anonymous sign-in href preserves create intent and only local next targets", () => {
  type Element = { type: string; props: Record<string, unknown> };
  const code = compile("../components/screens/CampaignScreen.tsx", true);
  for (const [id, initialCreate, expected] of [["", true, "/campaigns?create=1"], ["101", true, "/campaigns?create=1"], ["101", false, "/campaigns?id=101"], ["", false, "/campaigns?mode=testnet"]] as const) {
    let cursor = 0; const sandboxModule = { exports: {} as { default(props: { id: string; initialCreate: boolean }): Element } };
    const jsx = (type: unknown, props: Record<string, unknown>): Element => ({ type: String(type), props });
    runInNewContext(code, { module: sandboxModule, exports: sandboxModule.exports, require(name: string) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      if (name === "react") return { useState: (initial: unknown) => [cursor++ === 0 ? { ok: true, viewer: null, now: "1000", campaigns: [], contractId: "example" } : typeof initial === "function" ? initial() : initial, () => {}], useRef: () => ({ current: null }), useEffect: () => {}, useCallback: (fn: unknown) => fn };
      if (name === "next/link") return { default: "Link" };
      if (name === "next/image") return { default: "Image" };
      if (name === "@/components/ui/kit") return { T: {}, Ico: new Proxy({}, { get: () => () => null }), Btn: "Btn", Card: "Card", PoweredByStellar: "PoweredByStellar" };
      if (name === "@/lib/ui/useUnresolvedSubmission") return { useUnresolvedSubmission: () => ({ locked: false }) };
      if (name === "@/components/I18nProvider") return { useT: () => ({ locale: "en" }) };
      if (name === "@/lib/i18n/revamp-account") return accountCopy;
      if (name === "@/lib/ui/useGoBack") return { useGoBack: () => () => { throw Error("Navigation forbidden in isolated sign-in rendering test"); } };
      if (name === "@/lib/local-preview") return { isLocalPreview: false, PREVIEW_WALLET: { address: "example" }, PREVIEW_CAMPAIGNS: [] };
      if (name.endsWith(".module.css")) return { default: {} };
      return {};
    } });
    const tree = sandboxModule.exports.default({ id, initialCreate });
    function nodes(value: unknown): Element[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object" || !("props" in value)) return []; const node = value as Element; return [node, ...nodes(node.props.children)]; }
    const link = nodes(tree).find(node => node.type === "Link" && String(node.props.href).startsWith("/signin?next=")); assert.ok(link);
    const href = new URL(String(link.props.href), "http://localhost:3000"); assert.equal(href.searchParams.get("next"), expected);
  }
});
