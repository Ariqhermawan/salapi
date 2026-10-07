import test from "node:test";
import assert from "node:assert/strict";
import { win32, posix } from "node:path";
import { Networks } from "@stellar/stellar-sdk";
import {
  buildQaWalletManifest, fundQaWallets, generateQaWalletKeys, parseWalletCommand, persistQaWalletKeys,
  QA_FRIENDBOT, QA_HORIZON, validateQaOutputPath, validateQaProviderUrl, validateQaSeparatedDirectories, validateQaWalletKeys, walletRoles,
  type QaKeyCodec, type QaWalletKeys,
} from "./qa-circles-wallets.mts";

// Synthetic pairs only, never generated custody keys, files or real providers.
const codec: QaKeyCodec = {
  validPublic: value => /^PUBLIC_[1-5]$/.test(value),
  publicFromSecret: value => { if (!/^FAKE_SECRET_[1-5]$/.test(value)) throw Error("Synthetic secret rejected"); return value.replace("FAKE_SECRET_", "PUBLIC_"); },
};
const fixture = (): QaWalletKeys => ({ creator: { publicKey: "PUBLIC_1", secret: "FAKE_SECRET_1" },
  beneficiary: { publicKey: "PUBLIC_2", secret: "FAKE_SECRET_2" },
  reviewers: [3, 4, 5].map(value => ({ publicKey: `PUBLIC_${value}`, secret: `FAKE_SECRET_${value}` })) as QaWalletKeys["reviewers"] });
const json = (data: unknown, status = 200) => Response.json(data, { status });
const account = (publicKey: string, balance = "10000.0000000") => ({ account_id: publicKey, balances: [{ asset_type: "native", balance }] });
type Request = { url: URL; init: RequestInit };
function provider(run: (request: Request) => Promise<Response> | Response) {
  const calls: Request[] = [];
  const fetcher = (async (input: string | URL | globalThis.Request, init?: RequestInit) => {
    const entry = { url: new URL(String(input)), init: init ?? {} }; calls.push(entry);
    assert.equal(entry.init.method, "GET"); assert.equal(entry.init.redirect, "error"); assert.equal(entry.init.cache, "no-store");
    assert.ok(entry.init.signal); assert.equal(String(input).includes("SECRET"), false);
    return run(entry);
  }) as typeof fetch;
  return { calls, fetcher };
}
const network = () => json({ network_passphrase: Networks.TESTNET });

test("generation invokes a new-pair factory exactly five times and assigns distinct roles", () => {
  let count = 0;
  const keys = generateQaWalletKeys(() => { const value = ++count; return { publicKey: `PUBLIC_${value}`, secret: `FAKE_SECRET_${value}` }; }, codec);
  assert.equal(count, 5); assert.equal(new Set(walletRoles(keys).map(value => value.publicKey)).size, 5);
  assert.deepEqual(walletRoles(keys).map(value => value.role), ["creator", "beneficiary", "reviewer1", "reviewer2", "reviewer3"]);
});
test("duplicate generated roles fail instead of replacing, funding or silently retrying keys", () => {
  let count = 0;
  assert.throws(() => generateQaWalletKeys(() => { count++; return fixture().creator; }, codec), /QA wallet validation/);
  assert.equal(count, 5);
});
test("private schema rejects extra fields, wrong reviewer count, mismatched and duplicate pairs", () => {
  const cases: unknown[] = [null, { ...fixture(), network: "testnet" }, { ...fixture(), reviewers: [] },
    { ...fixture(), creator: { ...fixture().creator, email: "example.invalid" } },
    { ...fixture(), creator: { publicKey: "PUBLIC_1", secret: "FAKE_SECRET_2" } },
    { ...fixture(), beneficiary: fixture().creator }];
  for (const value of cases) assert.throws(() => validateQaWalletKeys(value, codec), /QA wallet validation/);
});
test("public manifest has the engine's eight exact public fields and no secret values", () => {
  const manifest = buildQaWalletManifest(fixture(), 1000n);
  assert.deepEqual(Object.keys(manifest).sort(), ["network", "contractId", "tokenId", "creatorWallet", "beneficiaryWallet", "approverWallets", "fundingDeadline", "reviewDeadline"].sort());
  assert.equal(manifest.network, "testnet"); assert.equal(manifest.fundingDeadline, String(1000n + 30n * 86400n));
  assert.equal(manifest.reviewDeadline, String(1000n + 37n * 86400n));
  assert.equal(JSON.stringify(manifest).includes("SECRET"), false); assert.equal(JSON.stringify(walletRoles(fixture())).includes("SECRET"), false);
  assert.throws(() => buildQaWalletManifest(fixture(), 0n)); assert.throws(() => buildQaWalletManifest(fixture(), 1n << 64n));
});
test("private persistence uses exclusive wx and 0600, and never overwrites a retained file", () => {
  const memory = new Map<string, string>(); let writes = 0;
  const write = (filename: string, data: string, options: { flag: "wx"; mode: number }) => {
    assert.equal(options.flag, "wx"); assert.equal(options.mode, 0o600); if (memory.has(filename)) throw Error("EEXIST");
    writes++; memory.set(filename, data);
  };
  persistQaWalletKeys("/private/new.json", fixture(), write);
  assert.throws(() => persistQaWalletKeys("/private/new.json", fixture(), write), /EEXIST/);
  assert.equal(writes, 1); assert.equal(memory.size, 1);
});
test("canonical Windows containment rejects relative, traversal, repo junction and alternate-stream paths", () => {
  const allowed = "C:/private/qa", repo = "C:/checkout";
  assert.equal(validateQaOutputPath("C:/private/qa/keys.json", allowed, "C:/secure/qa", repo, win32), "C:\\secure\\qa\\keys.json");
  for (const target of ["keys.json", "C:/private/qa/../keys.json", "C:/private/qa/nested/keys.json", "C:/private/qa/keys.json:secret"])
    assert.throws(() => validateQaOutputPath(target, allowed, "C:/secure/qa", repo, win32));
  assert.throws(() => validateQaOutputPath("C:/private/qa/keys.json", allowed, "C:/checkout/private", repo, win32));
  assert.throws(() => validateQaOutputPath("C:/private/qa/keys.json", allowed, repo, repo, win32));
  assert.throws(() => validateQaOutputPath("C:/private/qa/keys.json", allowed, "C:/", repo, win32));
});
test("canonical POSIX containment treats sibling prefixes correctly and never accepts the repo root", () => {
  assert.equal(validateQaOutputPath("/private/keys.json", "/private", "/repo-sibling", "/repo", posix), "/repo-sibling/keys.json");
  assert.throws(() => validateQaOutputPath("/private/keys.json", "/private", "/repo/private", "/repo", posix));
});
test("canonical private and public directories cannot be equal or nested in either direction", () => {
  validateQaSeparatedDirectories("C:/private/qa", "C:/public/evidence", win32);
  for (const [privateDirectory, publicDirectory] of [["C:/public/keys", "C:/public"],
    ["C:/private", "C:/private/evidence"], ["C:/private", "C:/PRIVATE"]])
    assert.throws(() => validateQaSeparatedDirectories(privateDirectory, publicDirectory, win32));
});
test("CLI has no default funding mode and rejects mixed, duplicate or provider-override arguments", () => {
  assert.deepEqual(parseWalletCommand(["--help"]), { mode: "help" });
  assert.equal(parseWalletCommand(["generate", "--private-dir", "/private", "--keys", "/private/keys.json", "--manifest", "/public/manifest.json"]).mode, "generate");
  assert.equal(parseWalletCommand(["fund-testnet", "--private-dir", "/private", "--keys", "/private/keys.json"]).mode, "fund-testnet");
  for (const args of [[], ["generate"], ["--fund-testnet"],
    ["generate", "--private-dir", "/private", "--keys", "/private/keys.json", "--manifest", "/public/manifest.json", "fund-testnet"],
    ["fund-testnet", "--private-dir", "/private", "--keys", "/private/keys.json", "--url", "https://example.invalid"],
    ["fund-testnet", "--private-dir", "/private", "--keys", "/private/keys.json", "--keys", "/other.json"]]) assert.throws(() => parseWalletCommand(args));
});
test("provider allowlist rejects mainnet, subdomains, credentials, redirects, ports and extra queries", () => {
  assert.equal(validateQaProviderUrl(`${QA_FRIENDBOT}?addr=PUBLIC_1`, codec), `${QA_FRIENDBOT}?addr=PUBLIC_1`);
  assert.equal(validateQaProviderUrl(`${QA_HORIZON}/accounts/PUBLIC_1`, codec), `${QA_HORIZON}/accounts/PUBLIC_1`);
  for (const url of ["https://horizon.stellar.org/accounts/PUBLIC_1", "https://friendbot.stellar.org.evil.invalid/?addr=PUBLIC_1",
    "http://friendbot.stellar.org/?addr=PUBLIC_1", "https://x@friendbot.stellar.org/?addr=PUBLIC_1", "https://friendbot.stellar.org:8443/?addr=PUBLIC_1",
    `${QA_FRIENDBOT}?addr=PUBLIC_1&extra=x`, `${QA_FRIENDBOT}?addr=PUBLIC_1&addr=PUBLIC_2`, `${QA_FRIENDBOT}fund?addr=PUBLIC_1`,
    `${QA_FRIENDBOT}?addr=PUBLIC_1#x`, `${QA_HORIZON}/accounts/PUBLIC_1?x=y`, `${QA_HORIZON}/accounts/invalid`]) assert.throws(() => validateQaProviderUrl(url, codec));
});
test("already funded exact Testnet accounts never call Friendbot", async () => {
  const stub = provider(({ url }) => url.pathname === "/" ? network() : json(account(url.pathname.split("/").at(-1)!)));
  const result = await fundQaWallets(fixture(), stub.fetcher, 100, codec);
  assert.equal(result.ok, true); assert.equal(result.accounts.length, 5); assert.ok(result.accounts.every(value => value.status === "already_confirmed"));
  assert.equal(stub.calls.filter(value => value.url.hostname === "friendbot.stellar.org").length, 0);
  assert.equal(JSON.stringify(result).includes("SECRET"), false);
});
test("only explicit account 404 funds once per saved role, then confirms the exact native balance", async () => {
  const seen = new Set<string>(); const faucet = new Set<string>();
  const stub = provider(({ url }) => {
    if (url.origin === QA_HORIZON && url.pathname === "/") return network();
    if (url.hostname === "friendbot.stellar.org") { faucet.add(url.searchParams.get("addr")!); return json({ ignored: "not proof" }); }
    const key = url.pathname.split("/").at(-1)!;
    if (!seen.has(key)) { seen.add(key); return json({}, 404); }
    assert.ok(faucet.has(key)); return json(account(key));
  });
  const result = await fundQaWallets(fixture(), stub.fetcher, 100, codec);
  assert.equal(result.ok, true); assert.equal(faucet.size, 5); assert.ok(result.accounts.every(value => value.status === "confirmed_after_faucet"));
});
test("wrong network and redirected responses stop before any faucet request", async () => {
  const mainnet = provider(() => json({ network_passphrase: Networks.PUBLIC }));
  await assert.rejects(fundQaWallets(fixture(), mainnet.fetcher, 100, codec)); assert.equal(mainnet.calls.length, 1);
  const redirected = provider(() => { const response = network(); Object.defineProperty(response, "redirected", { value: true }); return response; });
  await assert.rejects(fundQaWallets(fixture(), redirected.fetcher, 100, codec)); assert.equal(redirected.calls.length, 1);
});
test("faucet HTTP success with missing accounts never confirms funding", async () => {
  const stub = provider(({ url }) => url.origin === QA_HORIZON && url.pathname === "/" ? network()
    : url.hostname === "friendbot.stellar.org" ? json({ success: true }) : json({}, 404));
  const result = await fundQaWallets(fixture(), stub.fetcher, 100, codec);
  assert.equal(result.ok, false); assert.ok(result.accounts.every(value => value.status === "unconfirmed"));
});
test("account identity mismatch, zero, malformed balance and provider outage never faucet or confirm", async () => {
  const invalid = [account("OTHER"), account("PUBLIC_1", "0.0000000"), account("PUBLIC_1", "NaN"),
    { ...account("PUBLIC_1"), balances: [{ asset_type: "credit_alphanum4", balance: "10000.0000000" }] }];
  for (const value of invalid) {
    const stub = provider(({ url }) => url.pathname === "/" ? network() : json(value));
    const result = await fundQaWallets(fixture(), stub.fetcher, 100, codec); assert.equal(result.ok, false);
    assert.equal(stub.calls.filter(entry => entry.url.hostname === "friendbot.stellar.org").length, 0);
  }
  const outage = provider(({ url }) => url.pathname === "/" ? network() : json({}, 503));
  assert.equal((await fundQaWallets(fixture(), outage.fetcher, 100, codec)).ok, false);
  assert.equal(outage.calls.filter(entry => entry.url.hostname === "friendbot.stellar.org").length, 0);
});
test("lost faucet response is accepted only when Horizon independently confirms the same saved account", async () => {
  const seen = new Set<string>();
  const stub = provider(({ url }) => {
    if (url.origin === QA_HORIZON && url.pathname === "/") return network();
    if (url.hostname === "friendbot.stellar.org") throw Error("Synthetic provider detail must not escape");
    const key = url.pathname.split("/").at(-1)!;
    if (!seen.has(key)) { seen.add(key); return json({}, 404); }
    return json(account(key));
  });
  assert.equal((await fundQaWallets(fixture(), stub.fetcher, 100, codec)).ok, true);
});
test("hung provider or JSON parsing is bounded and cannot create a false confirmation", async () => {
  const hung = provider(() => new Promise<Response>(() => {}));
  await assert.rejects(fundQaWallets(fixture(), hung.fetcher, 5, codec), /QA wallet validation/);
  assert.equal(hung.calls.length, 1); assert.equal(hung.calls[0].init.signal?.aborted, true);
  const bodyHung = provider(({ url }) => {
    if (url.pathname === "/") return network();
    const response = json({}); response.json = () => new Promise<unknown>(() => {}); return response;
  });
  const result = await fundQaWallets(fixture(), bodyHung.fetcher, 5, codec);
  assert.equal(result.ok, false); assert.ok(result.accounts.every(value => value.status === "unconfirmed"));
  assert.equal(bodyHung.calls.filter(entry => entry.url.hostname === "friendbot.stellar.org").length, 0);
});
