// Isolated QA keys only. Generation is offline; funding is a separate command.
// The parent prepares the fixed private directory with user-only ACLs first.
// Never use an existing user's wallet, environment secret or public artifact.
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import type { QaProvisionInput } from "./qa-circles-provision.mts";

export const QA_PRIVATE_DIRECTORY = "C:/Users/Lenovo/.codex/private/salapi-circles-qa-20261007";
export const QA_PUBLIC_DIRECTORY = "C:/Users/Lenovo/AppData/Local/Temp/salapi-circles-rollout-20261007";
export const QA_FRIENDBOT = "https://friendbot.stellar.org/";
export const QA_HORIZON = "https://horizon-testnet.stellar.org";
const D4 = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
const XLM = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MAX_KEY_FILE_BYTES = 8_192;
const roles = ["creator", "beneficiary", "reviewer1", "reviewer2", "reviewer3"] as const;
export type QaRole = typeof roles[number];
export type QaKeyPair = { publicKey: string; secret: string };
export type QaWalletKeys = { creator: QaKeyPair; beneficiary: QaKeyPair; reviewers: [QaKeyPair, QaKeyPair, QaKeyPair] };
export type QaKeyCodec = { validPublic(value: string): boolean; publicFromSecret(value: string): string };
const stellarCodec: QaKeyCodec = {
  validPublic: value => StrKey.isValidEd25519PublicKey(value),
  publicFromSecret: value => Keypair.fromSecret(value).publicKey(),
};
function fail(): never { throw new Error("QA wallet validation or provider confirmation failed."); }
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}
export function walletRoles(keys: QaWalletKeys): { role: QaRole; publicKey: string }[] {
  return [keys.creator, keys.beneficiary, ...keys.reviewers].map((key, index) => ({ role: roles[index], publicKey: key.publicKey }));
}
export function validateQaWalletKeys(value: unknown, codec: QaKeyCodec = stellarCodec): QaWalletKeys {
  try {
    if (!object(value) || !exactKeys(value, ["creator", "beneficiary", "reviewers"]) ||
      !Array.isArray(value.reviewers) || value.reviewers.length !== 3) return fail();
    const pairs = [value.creator, value.beneficiary, ...value.reviewers].map(pair => {
      if (!object(pair) || !exactKeys(pair, ["publicKey", "secret"]) || typeof pair.publicKey !== "string" ||
        typeof pair.secret !== "string" || !codec.validPublic(pair.publicKey) || codec.publicFromSecret(pair.secret) !== pair.publicKey) return fail();
      return { publicKey: pair.publicKey, secret: pair.secret };
    });
    if (pairs.length !== 5 || new Set(pairs.map(pair => pair.publicKey)).size !== 5) return fail();
    return { creator: pairs[0], beneficiary: pairs[1], reviewers: [pairs[2], pairs[3], pairs[4]] };
  } catch { return fail(); }
}
export function generateQaWalletKeys(make: () => QaKeyPair = () => {
  const key = Keypair.random(); return { publicKey: key.publicKey(), secret: key.secret() };
}, codec: QaKeyCodec = stellarCodec): QaWalletKeys {
  const pairs = Array.from({ length: 5 }, () => make());
  return validateQaWalletKeys({ creator: pairs[0], beneficiary: pairs[1], reviewers: pairs.slice(2) }, codec);
}
export function buildQaWalletManifest(keys: QaWalletKeys, anchor = BigInt(Math.floor(Date.now() / 1000))): QaProvisionInput {
  if (anchor <= 0n || anchor + 37n * 86_400n > (1n << 64n) - 1n) return fail();
  return { network: "testnet", contractId: D4, tokenId: XLM,
    creatorWallet: keys.creator.publicKey, beneficiaryWallet: keys.beneficiary.publicKey,
    approverWallets: keys.reviewers.map(key => key.publicKey),
    fundingDeadline: (anchor + 30n * 86_400n).toString(), reviewDeadline: (anchor + 37n * 86_400n).toString() };
}

type Paths = Pick<typeof path, "isAbsolute" | "resolve" | "dirname" | "relative" | "sep" | "basename">;
function samePath(left: string, right: string, api: Paths) {
  return api.sep === "\\" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function outsideDirectory(parent: string, child: string, api: Paths) {
  const rel = api.relative(parent, child);
  return rel === ".." || rel.startsWith(".." + api.sep) || api.isAbsolute(rel);
}
export function validateQaSeparatedDirectories(privateDirectory: string, publicDirectory: string, api: Paths = path): void {
  if (!api.isAbsolute(privateDirectory) || !api.isAbsolute(publicDirectory) ||
    !outsideDirectory(api.resolve(privateDirectory), api.resolve(publicDirectory), api) ||
    !outsideDirectory(api.resolve(publicDirectory), api.resolve(privateDirectory), api)) return fail();
}
/** Pure containment check; runtime callers supply realpath-resolved directories. */
export function validateQaOutputPath(target: string, allowed: string, canonicalDirectory: string,
  canonicalRepository: string, api: Paths = path): string {
  if (![target, allowed, canonicalDirectory, canonicalRepository].every(value => api.isAbsolute(value))) return fail();
  const resolved = api.resolve(target), permitted = api.resolve(allowed), canonical = api.resolve(canonicalDirectory);
  if (samePath(api.dirname(canonical), canonical, api)) return fail();
  if (!samePath(api.dirname(resolved), permitted, api) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(api.basename(resolved))) return fail();
  if (!outsideDirectory(api.resolve(canonicalRepository), canonical, api)) return fail();
  return api.resolve(canonical, api.basename(resolved));
}
function canonicalDirectory(value: string): string {
  if (!path.isAbsolute(value) || !fs.statSync(value).isDirectory()) return fail();
  return fs.realpathSync(value);
}
function privateFile(privateDirectory: string, target: string): string {
  if (!path.isAbsolute(privateDirectory) || !samePath(path.resolve(privateDirectory), path.resolve(QA_PRIVATE_DIRECTORY), path)) return fail();
  const canonical = canonicalDirectory(QA_PRIVATE_DIRECTORY);
  if (fs.existsSync(QA_PUBLIC_DIRECTORY)) validateQaSeparatedDirectories(canonical, canonicalDirectory(QA_PUBLIC_DIRECTORY));
  // On POSIX the mode is enforceable here. Windows security comes from the
  // parent-verified ACL on this exact pre-existing directory, inherited by files.
  if (process.platform !== "win32" && (fs.statSync(canonical).mode & 0o077) !== 0) return fail();
  return validateQaOutputPath(target, QA_PRIVATE_DIRECTORY, canonical, fs.realpathSync(repository));
}
function publicFile(target: string, privateDirectory: string): string {
  const canonical = canonicalDirectory(QA_PUBLIC_DIRECTORY);
  validateQaSeparatedDirectories(privateDirectory, canonical);
  return validateQaOutputPath(target, QA_PUBLIC_DIRECTORY, canonical, fs.realpathSync(repository));
}
export type ExclusiveWriter = (filename: string, data: string, options: { flag: "wx"; mode: number }) => void;
/** Exclusive create only. A failure leaves retained keys for manual review. */
export function persistQaWalletKeys(filename: string, keys: QaWalletKeys,
  write: ExclusiveWriter = (file, data, options) => fs.writeFileSync(file, data, options)): void {
  write(filename, JSON.stringify(keys, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
function readGeneratedKeys(filename: string): QaWalletKeys {
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > MAX_KEY_FILE_BYTES ||
    (process.platform !== "win32" && (info.mode & 0o077) !== 0) || !samePath(fs.realpathSync(filename), filename, path)) return fail();
  const descriptor = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fs.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > MAX_KEY_FILE_BYTES || opened.ino !== info.ino || opened.dev !== info.dev) return fail();
    return validateQaWalletKeys(JSON.parse(fs.readFileSync(descriptor, "utf8")));
  } finally { fs.closeSync(descriptor); }
}

export function validateQaProviderUrl(input: string, codec: QaKeyCodec = stellarCodec): string {
  const url = new URL(input);
  if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash) return fail();
  if (url.origin === new URL(QA_FRIENDBOT).origin && url.pathname === "/" &&
    [...url.searchParams.keys()].join(",") === "addr" && codec.validPublic(url.searchParams.get("addr") ?? "")) return url.href;
  if (url.origin === QA_HORIZON && !url.search && (url.pathname === "/" ||
    url.pathname.startsWith("/accounts/") && codec.validPublic(url.pathname.slice("/accounts/".length)))) return url.href;
  return fail();
}
type ProviderResult = { status: number; data: unknown };
async function providerRequest(input: string, json: boolean, fetcher: typeof fetch, timeoutMs: number,
  codec: QaKeyCodec): Promise<ProviderResult> {
  const url = validateQaProviderUrl(input, codec);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { method: "GET", redirect: "error", cache: "no-store", signal: controller.signal });
        if (response.redirected || response.url && response.url !== url) return fail();
        if (response.status === 404 && json) return { status: 404, data: null };
        if (!response.ok) return fail();
        if (json) return { status: response.status, data: await response.json() };
        await response.body?.cancel();
        return { status: response.status, data: null };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => {
        controller.abort(); reject(new Error("Testnet provider confirmation unavailable."));
      }, timeoutMs); }),
    ]);
  } catch { return fail(); }
  finally { if (timer) clearTimeout(timer); }
}
function nativeAccount(value: unknown, publicKey: string): string {
  if (!object(value) || value.account_id !== publicKey || !Array.isArray(value.balances)) return fail();
  const native = value.balances.filter(balance => object(balance) && balance.asset_type === "native");
  if (native.length !== 1 || !object(native[0]) || typeof native[0].balance !== "string" ||
    !/^(0|[1-9][0-9]*)\.[0-9]{7}$/.test(native[0].balance)) return fail();
  const balance = native[0].balance, stroops = BigInt(balance.replace(".", ""));
  if (stroops <= 0n || stroops > (1n << 63n) - 1n) return fail();
  return balance;
}
export type QaFundingResult = { ok: boolean; network: "testnet"; asset: "XLM";
  accounts: { role: QaRole; publicKey: string; status: "already_confirmed" | "confirmed_after_faucet" | "unconfirmed"; balanceXlm?: string }[] };
/** A faucet response is never confirmation. Only the exact Horizon account is. */
export async function fundQaWallets(value: unknown, fetcher: typeof fetch = fetch, timeoutMs = 10_000,
  codec: QaKeyCodec = stellarCodec): Promise<QaFundingResult> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) return fail();
  const keys = validateQaWalletKeys(value, codec);
  const network = await providerRequest(QA_HORIZON + "/", true, fetcher, timeoutMs, codec);
  if (!object(network.data) || network.data.network_passphrase !== Networks.TESTNET) return fail();
  const accounts: QaFundingResult["accounts"] = [];
  for (const { role, publicKey } of walletRoles(keys)) {
    try {
      const first = await providerRequest(`${QA_HORIZON}/accounts/${publicKey}`, true, fetcher, timeoutMs, codec);
      if (first.status !== 404) {
        accounts.push({ role, publicKey, status: "already_confirmed", balanceXlm: nativeAccount(first.data, publicKey) });
        continue;
      }
      try { await providerRequest(`${QA_FRIENDBOT}?addr=${encodeURIComponent(publicKey)}`, false, fetcher, timeoutMs, codec); }
      catch { /* Lost/rejected faucet response is reconciled against this saved address. */ }
      const confirmed = await providerRequest(`${QA_HORIZON}/accounts/${publicKey}`, true, fetcher, timeoutMs, codec);
      if (confirmed.status === 404) return fail();
      accounts.push({ role, publicKey, status: "confirmed_after_faucet", balanceXlm: nativeAccount(confirmed.data, publicKey) });
    } catch { accounts.push({ role, publicKey, status: "unconfirmed" }); }
  }
  return { ok: accounts.length === 5 && accounts.every(account => account.status !== "unconfirmed"), network: "testnet", asset: "XLM", accounts };
}

export type WalletCommand = { mode: "help" } | { mode: "generate"; privateDirectory: string; keys: string; manifest: string }
  | { mode: "fund-testnet"; privateDirectory: string; keys: string };
export function parseWalletCommand(argv: string[]): WalletCommand {
  if (argv.length === 1 && argv[0] === "--help") return { mode: "help" };
  const mode = argv[0];
  if (mode !== "generate" && mode !== "fund-testnet") return fail();
  const options = new Map<string, string>();
  const accepted = mode === "generate" ? ["--private-dir", "--keys", "--manifest"] : ["--private-dir", "--keys"];
  for (let index = 1; index < argv.length; index += 2) {
    const name = argv[index], value = argv[index + 1];
    if (!accepted.includes(name) || options.has(name) || !value || value.startsWith("--")) return fail();
    options.set(name, value);
  }
  if (options.size !== accepted.length || accepted.some(name => !options.has(name))) return fail();
  const common = { privateDirectory: options.get("--private-dir")!, keys: options.get("--keys")! };
  return mode === "generate" ? { mode, ...common, manifest: options.get("--manifest")! } : { mode, ...common };
}
async function cli() {
  const command = parseWalletCommand(process.argv.slice(2));
  if (command.mode === "help") {
    console.log("generate --private-dir <fixed-private-directory> --keys <absolute-private.json> --manifest <absolute-public.json>\nfund-testnet --private-dir <fixed-private-directory> --keys <absolute-private.json>\nGeneration is offline and refuses existing files. Parent must prepare user-only ACLs. Funding uses only fixed Stellar Testnet providers; no USDC or monetary-value claim.");
    return;
  }
  const keysFile = privateFile(command.privateDirectory, command.keys);
  if (command.mode === "generate") {
    const manifestFile = publicFile(command.manifest, path.dirname(keysFile));
    if (fs.existsSync(keysFile) || fs.existsSync(manifestFile)) return fail();
    const keys = generateQaWalletKeys(), manifest = buildQaWalletManifest(keys);
    persistQaWalletKeys(keysFile, keys);
    // If this second exclusive write fails, retain the private file. Never
    // regenerate replacement keys or overwrite either retained file on retry.
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ mode: "generated", network: "testnet", keyCount: 5, manifest }));
  } else {
    const result = await fundQaWallets(readGeneratedKeys(keysFile));
    console.log(JSON.stringify({ mode: "fund-testnet", ...result }));
    if (!result.ok) process.exitCode = 1;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cli().catch(() => {
    // Never echo inputs, SDK/provider errors, key JSON, stacks or secret text.
    console.error("QA wallet helper failed. Retained files are not overwritten. Confirm Testnet account status before retrying.");
    process.exitCode = 1;
  });
}
