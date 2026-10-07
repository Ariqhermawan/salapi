// Explicit D4 Testnet QA provisioning. Default: offline public plan only.
// No deployment, Friendbot, donations, release, or database write is performed.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as Stellar from "@stellar/stellar-sdk";
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, Transaction, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { campaignStruct } from "../lib/campaign.ts";
import type { Circle } from "../lib/circles/types.ts";
import type { StoredCircleTestnetMapping } from "../lib/circles/testnet.ts";

export const QA_D4_CONTRACT = "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU";
export const QA_XLM_SAC = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
export const QA_RPC = "https://soroban-testnet.stellar.org";
export const QA_RPC_TIMEOUT_MS = 10_000;
const DAY = 86_400n;
const PURPOSE = "fictional-circles-qa";
const MAX_U64 = (1n << 64n) - 1n;
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptRoot, "../..");

// Reuse the exact application catalog and validators without changing its
// extensionless Next.js imports. Only these fixed, pure modules are evaluated.
const fixtureCache = new Map<string, Record<string, unknown>>();
function fixture(path: string): Record<string, unknown> {
  if (fixtureCache.has(path)) return fixtureCache.get(path)!;
  const exports: Record<string, unknown> = {};
  fixtureCache.set(path, exports);
  const code = ts.transpileModule(readFileSync(resolve(scriptRoot, path), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(code, { exports, TextEncoder, Uint8Array, URL, require(name: string) {
    if (name === "@stellar/stellar-sdk") return Stellar;
    if (name === "./seed") return fixture("../lib/circles/seed.ts");
    if (name === "./organizers") return fixture("../lib/circles/organizers.ts");
    throw new Error("Unexpected QA fixture dependency");
  } });
  return exports;
}
const catalog = fixture("../lib/circles/seed.ts").SEED_CIRCLES as Circle[];
const validators = fixture("../lib/circles/testnet.ts") as unknown as typeof import("../lib/circles/testnet.ts");
export type QaProvisionInput = {
  network: "testnet"; contractId: string; tokenId: string;
  creatorWallet: string; beneficiaryWallet: string; approverWallets: string[];
  fundingDeadline: string; reviewDeadline: string;
};
export type QaProvisionCircle = { circleSlug: string; title: string; creatorCutBps: number };
export type QaProvisionPlan = QaProvisionInput & {
  schemaVersion: 1; purpose: typeof PURPOSE; qaLabel: "QA Testnet · fictional cause";
  splitPolicy: "existing-fictional-fixture-allowance"; circles: QaProvisionCircle[];
};
export function defaultQaProvisionInput(wallets: Pick<QaProvisionInput, "creatorWallet" | "beneficiaryWallet" | "approverWallets">,
  anchor = BigInt(Math.floor(Date.now() / 1000))): QaProvisionInput {
  return { network: "testnet", contractId: QA_D4_CONTRACT, tokenId: QA_XLM_SAC, ...wallets,
    fundingDeadline: (anchor + 30n * DAY).toString(), reviewDeadline: (anchor + 37n * DAY).toString() };
}
function positiveU64(value: unknown): string {
  assert(typeof value === "string" && /^[1-9][0-9]{0,19}$/.test(value) && BigInt(value) <= MAX_U64, "Expected canonical positive u64 text");
  return value;
}
export function buildQaProvisionPlan(input: unknown, now = BigInt(Math.floor(Date.now() / 1000))): QaProvisionPlan {
  assert(input && typeof input === "object" && !Array.isArray(input), "Expected a public QA manifest");
  const value = input as Record<string, unknown>;
  const fields = ["network", "contractId", "tokenId", "creatorWallet", "beneficiaryWallet", "approverWallets", "fundingDeadline", "reviewDeadline"];
  assert.deepEqual(Object.keys(value).sort(), fields.sort(), "Manifest must contain only the eight public configuration fields");
  assert(value.network === "testnet" && value.contractId === QA_D4_CONTRACT && value.tokenId === QA_XLM_SAC, "Only the pinned D4 Testnet/native-XLM deployment is allowed");
  const funding = positiveU64(value.fundingDeadline), review = positiveU64(value.reviewDeadline);
  assert(now > 0n && BigInt(funding) > now && BigInt(review) > BigInt(funding), "Funding must be future and review must follow funding");
  const wallets = [value.creatorWallet, value.beneficiaryWallet, ...(Array.isArray(value.approverWallets) ? value.approverWallets : [])];
  assert(Array.isArray(value.approverWallets) && value.approverWallets.length === 3 && wallets.length === 5 && new Set(wallets).size === 5 &&
    wallets.every(wallet => typeof wallet === "string" && Stellar.StrKey.isValidEd25519PublicKey(wallet)), "Five distinct QA public wallets are required");
  assert(catalog.length === 27 && new Set(catalog.map(circle => circle.id)).size === 27, "Expected exactly 27 canonical active Circles");
  const config = { network: "testnet" as const, contractId: QA_D4_CONTRACT, tokenId: QA_XLM_SAC,
    creatorWallet: value.creatorWallet as string, beneficiaryWallet: value.beneficiaryWallet as string,
    approverWallets: [...value.approverWallets] as string[], fundingDeadline: funding, reviewDeadline: review };
  const circles = Array.from(catalog, circle => {
    const creatorCutBps = (circle.allowance?.percentage ?? 0) * 100;
    const title = validators.circleTestnetCampaignTitle(circle.id);
    assert(title && Number.isInteger(creatorCutBps), "Invalid canonical QA title or fixture cut");
    const result = { circleSlug: circle.id, title, creatorCutBps };
    assert(validators.validatedCircleTestnetMapping(mappingRow(config, result, "1"), QA_D4_CONTRACT, QA_XLM_SAC), "Plan failed application mapping validation");
    return result;
  });
  return { ...config, schemaVersion: 1, purpose: PURPOSE, qaLabel: "QA Testnet · fictional cause",
    splitPolicy: "existing-fictional-fixture-allowance", circles };
}
export function planFingerprint(plan: QaProvisionPlan): string {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}
export function mappingRow(plan: QaProvisionInput, circle: QaProvisionCircle, campaignId: string) {
  return { network: "testnet", contract_id: plan.contractId, token_id: plan.tokenId, circle_slug: circle.circleSlug,
    campaign_id: campaignId, campaign_title: circle.title, creator_wallet: plan.creatorWallet,
    beneficiary_wallet: plan.beneficiaryWallet, approver_wallets: [...plan.approverWallets], creator_cut_bps: circle.creatorCutBps,
    funding_deadline: plan.fundingDeadline, review_deadline: plan.reviewDeadline, purpose: PURPOSE, archived_at: null };
}
function mapping(plan: QaProvisionPlan, circle: QaProvisionCircle, campaignId: string): StoredCircleTestnetMapping {
  const result = validators.validatedCircleTestnetMapping(mappingRow(plan, circle, campaignId), plan.contractId, plan.tokenId);
  assert(result, "Invalid campaign mapping"); return result;
}
export function createOperation(plan: QaProvisionPlan, circle: QaProvisionCircle): xdr.Operation {
  const addr = (wallet: string) => new Address(wallet).toScVal();
  return new Contract(plan.contractId).call("create", campaignStruct({
    creator: addr(plan.creatorWallet), beneficiary: addr(plan.beneficiaryWallet), token: addr(plan.tokenId),
    creator_cut_bps: nativeToScVal(circle.creatorCutBps, { type: "u32" }),
    funding_deadline: nativeToScVal(BigInt(plan.fundingDeadline), { type: "u64" }),
    review_deadline: nativeToScVal(BigInt(plan.reviewDeadline), { type: "u64" }),
    approvers: plan.approverWallets.map(addr),
  }), nativeToScVal(circle.title, { type: "string" }));
}
export function verifyCreateEnvelope(plan: QaProvisionPlan, circle: QaProvisionCircle, hash: string, envelope: string): Transaction {
  const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
  assert(tx instanceof Transaction && tx.source === plan.creatorWallet && tx.operations.length === 1, "Unexpected create transaction/source");
  assert.equal(tx.hash().toString("hex"), hash, "Signed create hash mismatch");
  assert(tx.signatures.some(signature => Keypair.fromPublicKey(plan.creatorWallet).verify(tx.hash(), signature.signature())), "Missing valid QA creator signature");
  const operation = tx.operations[0];
  assert(operation.type === "invokeHostFunction" && (!operation.source || operation.source === plan.creatorWallet), "Unexpected create operation or source");
  assert.equal(operation.func.toXDR("base64"),
    createOperation(plan, circle).body().invokeHostFunctionOp().hostFunction().toXDR("base64"), "Signed transaction does not create the exact planned QA terms");
  return tx;
}
export type QaJournalEntry = { circleSlug: string; hash: string; envelopeXdr: string; simulationLedger: number;
  state: "prepared" | "submitted" | "confirmed"; campaignId?: string; receipt?: Record<string, unknown> };
export type QaProvisionJournal = { schemaVersion: 1; network: "testnet"; contractId: string; fingerprint: string; entries: QaJournalEntry[] };
export type QaTransactionOutcome = { status: "SUCCESS" | "FAILED" | "NOT_FOUND"; campaignId?: string; receipt?: Record<string, unknown> };
export function verifyQaCreateReceipt(plan: QaProvisionPlan, circle: QaProvisionCircle, expectedHash: string, receipt: Record<string, unknown>): string {
  assert(receipt.hash === expectedHash && Number.isSafeInteger(receipt.ledger) && (receipt.ledger as number) > 0 &&
    [receipt.envelopeXdr, receipt.resultXdr, receipt.resultMetaXdr, receipt.returnValueXdr].every(value => typeof value === "string"), "Incomplete committed create receipt");
  verifyCreateEnvelope(plan, circle, expectedHash, receipt.envelopeXdr as string);
  const result = xdr.TransactionResult.fromXDR(receipt.resultXdr as string, "base64").result();
  assert.equal(result.switch().name, "txSuccess", "Create receipt transaction failed");
  const operations = result.results();
  assert(operations.length === 1 && operations[0].switch().name === "opInner" && operations[0].tr().switch().name === "invokeHostFunction" &&
    operations[0].tr().invokeHostFunctionResult().switch().name === "invokeHostFunctionSuccess", "Create receipt host operation failed");
  const meta = xdr.TransactionMeta.fromXDR(receipt.resultMetaXdr as string, "base64");
  assert([3, 4].includes(meta.switch()), "Unsupported committed Soroban metadata");
  const soroban = meta.switch() === 3 ? meta.v3().sorobanMeta() : meta.v4().sorobanMeta();
  const retval = soroban?.returnValue();
  assert(retval && retval.switch().name === "scvU64" && retval.toXDR("base64") === receipt.returnValueXdr, "Create ID is not bound to committed return metadata");
  const id = positiveU64(String(scValToNative(retval)));
  const events = meta.switch() === 3 ? meta.v3().sorobanMeta()!.events() : meta.v4().operations().flatMap(operation => operation.events());
  const matching = events.filter(event => {
    if (event.type().name !== "contract" || !event.contractId() || Stellar.StrKey.encodeContract(Buffer.from(event.contractId()! as unknown as Uint8Array)) !== plan.contractId || event.body().switch() !== 0) return false;
    const body = event.body().v0(), topics = body.topics();
    return topics.length === 2 && topics[0].switch().name === "scvSymbol" && scValToNative(topics[0]) === "created" &&
      topics[1].switch().name === "scvU64" && String(scValToNative(topics[1])) === id &&
      !!validators.validatedCircleTestnetCampaign(scValToNative(body.data()), mapping(plan, circle, id), plan.tokenId);
  });
  assert.equal(matching.length, 1, "Receipt does not contain the exact D4 QA campaign creation event");
  return id;
}
export type QaProvisionRuntime = {
  network(): Promise<string>; account(publicKey: string): Promise<unknown>;
  read(method: string, args?: bigint[]): Promise<unknown>;
  prepare(circle: QaProvisionCircle): Promise<Pick<QaJournalEntry, "hash" | "envelopeXdr" | "simulationLedger">>;
  send(envelopeXdr: string): Promise<{ hash: string; status: string }>;
  transaction(entry: QaJournalEntry, circle: QaProvisionCircle): Promise<QaTransactionOutcome>;
  save(journal: QaProvisionJournal): void;
};
export function emptyJournal(plan: QaProvisionPlan): QaProvisionJournal {
  return { schemaVersion: 1, network: "testnet", contractId: plan.contractId, fingerprint: planFingerprint(plan), entries: [] };
}
function validateJournal(plan: QaProvisionPlan, journal: QaProvisionJournal) {
  assert(journal.schemaVersion === 1 && journal.network === "testnet" && journal.contractId === plan.contractId && journal.fingerprint === planFingerprint(plan), "Journal belongs to a different reviewed QA plan");
  assert(Array.isArray(journal.entries) && journal.entries.length <= 27 && new Set(journal.entries.map(entry => entry.circleSlug)).size === journal.entries.length, "Invalid or duplicate journal entry");
  for (const entry of journal.entries) {
    const circle = plan.circles.find(value => value.circleSlug === entry.circleSlug);
    assert(circle && ["prepared", "submitted", "confirmed"].includes(entry.state) && Number.isSafeInteger(entry.simulationLedger) && entry.simulationLedger > 0, "Invalid journal state");
    verifyCreateEnvelope(plan, circle, entry.hash, entry.envelopeXdr);
    if (entry.state === "confirmed") {
      positiveU64(entry.campaignId); assert(entry.receipt, "Confirmed create must retain its receipt");
      assert.equal(verifyQaCreateReceipt(plan, circle, entry.hash, entry.receipt), entry.campaignId, "Journal campaign ID differs from its committed create receipt");
    }
  }
}
function verifiedCampaign(plan: QaProvisionPlan, circle: QaProvisionCircle, raw: unknown, id: string) {
  const result = validators.validatedCircleTestnetCampaign(raw, mapping(plan, circle, id), plan.tokenId);
  assert(result, "D4 campaign differs from its exact reviewed QA mapping"); return result;
}
export async function preflightQaProvision(plan: QaProvisionPlan, runtime: Pick<QaProvisionRuntime, "network" | "read" | "account">) {
  assert.equal(await runtime.network(), Networks.TESTNET, "RPC is not Stellar Testnet");
  const [version, token, clock] = await Promise.all([runtime.read("version"), runtime.read("token"), runtime.read("clock")]);
  assert(version === 4 && token === QA_XLM_SAC && typeof clock === "bigint" && clock > 0n, "RPC target is not D4 version 4/native XLM");
  assert(BigInt(plan.fundingDeadline) > clock, "QA funding deadline has expired");
  await Promise.all([plan.creatorWallet, plan.beneficiaryWallet, ...plan.approverWallets].map(wallet => runtime.account(wallet)));
  // Discover every page, never predict sequential IDs or convert fixture IDs.
  const existing: unknown[] = []; let before = 0n;
  for (let pageNumber = 0; pageNumber < 200; pageNumber++) {
    const page = await runtime.read("campaigns", [before, 20n]);
    assert(Array.isArray(page) && page.length <= 20, "Invalid D4 campaign discovery page");
    existing.push(...page);
    if (page.length < 20) return existing;
    const lastId = (page[page.length - 1] as { id?: unknown }).id;
    assert(typeof lastId === "bigint" && lastId > 0n && (before === 0n || lastId < before), "D4 discovery cursor did not advance");
    before = lastId;
  }
  throw new Error("D4 discovery exceeded bounded 4000-campaign inspection");
}
export async function executeQaProvision(plan: QaProvisionPlan, runtime: QaProvisionRuntime, journal = emptyJournal(plan)) {
  // Rebuild canonical terms before any effect, including programmatic callers.
  const { network, contractId, tokenId, creatorWallet, beneficiaryWallet, approverWallets, fundingDeadline, reviewDeadline } = plan;
  assert.deepEqual(plan, buildQaProvisionPlan({ network, contractId, tokenId, creatorWallet, beneficiaryWallet, approverWallets, fundingDeadline, reviewDeadline }), "Plan was modified after review");
  validateJournal(plan, journal);
  const existing = await preflightQaProvision(plan, runtime);
  const bySlug = new Map<string, string>();
  // Reject every collision before creating anything, even a later catalog item.
  for (const circle of plan.circles) {
    const matches = existing.filter(raw => (raw as { title?: unknown })?.title === circle.title);
    assert(matches.length <= 1, "Duplicate QA title exists; review required before provisioning");
    if (matches.length) {
      const id = positiveU64(String((matches[0] as { id: unknown }).id));
      verifiedCampaign(plan, circle, matches[0], id); bySlug.set(circle.circleSlug, id);
    }
  }
  runtime.save(journal);
  const rows = [];
  for (const circle of plan.circles) {
    let entry = journal.entries.find(value => value.circleSlug === circle.circleSlug);
    if (entry && entry.state !== "confirmed") {
      // A known signed hash is reconciled, never resubmitted, including a
      // crash between local journaling and send. NOT_FOUND stays unresolved.
      const outcome = await runtime.transaction(entry, circle);
      assert(outcome.status === "SUCCESS" && outcome.campaignId && outcome.receipt,
        `Previous create ${entry.hash} is ${outcome.status}; stopped without resending`);
      assert.equal(verifyQaCreateReceipt(plan, circle, entry.hash, outcome.receipt), outcome.campaignId, "Create ID differs from its committed receipt");
      entry.state = "confirmed"; entry.campaignId = positiveU64(outcome.campaignId); entry.receipt = outcome.receipt;
      runtime.save(journal);
    }
    if (entry?.state === "confirmed") {
      const raw = await runtime.read("campaign", [BigInt(entry.campaignId!)]);
      verifiedCampaign(plan, circle, raw, entry.campaignId!);
      assert(!bySlug.has(circle.circleSlug) || bySlug.get(circle.circleSlug) === entry.campaignId, "Journal/discovery campaign mismatch");
      bySlug.set(circle.circleSlug, entry.campaignId!);
    }
    if (!bySlug.has(circle.circleSlug)) {
      const clock = await runtime.read("clock");
      assert(typeof clock === "bigint" && clock < BigInt(plan.fundingDeadline), "Funding expired during provisioning");
      const signed = await runtime.prepare(circle);
      verifyCreateEnvelope(plan, circle, signed.hash, signed.envelopeXdr);
      entry = { circleSlug: circle.circleSlug, ...signed, state: "prepared" };
      journal.entries.push(entry); runtime.save(journal); // Durable before send.
      const sent = await runtime.send(entry.envelopeXdr);
      assert.equal(sent.hash, entry.hash, "RPC send hash differs from journal");
      assert(!["ERROR", "TRY_AGAIN_LATER"].includes(sent.status), `Create ${entry.hash} send status ${sent.status}; journal retained`);
      entry.state = "submitted"; runtime.save(journal);
      const outcome = await runtime.transaction(entry, circle);
      assert(outcome.status === "SUCCESS" && outcome.campaignId && outcome.receipt,
        `Create ${entry.hash} is ${outcome.status}; stopped without a second create`);
      assert.equal(verifyQaCreateReceipt(plan, circle, entry.hash, outcome.receipt), outcome.campaignId, "Create ID differs from its committed receipt");
      entry.state = "confirmed"; entry.campaignId = positiveU64(outcome.campaignId); entry.receipt = outcome.receipt;
      runtime.save(journal);
      const raw = await runtime.read("campaign", [BigInt(entry.campaignId)]);
      verifiedCampaign(plan, circle, raw, entry.campaignId); bySlug.set(circle.circleSlug, entry.campaignId);
    }
    rows.push(mappingRow(plan, circle, bySlug.get(circle.circleSlug)!));
  }
  assert(rows.length === 27 && new Set(rows.map(row => row.campaign_id)).size === 27, "QA campaign IDs must be distinct");
  return { journal, rows };
}
export function mappingInsertSql(rows: ReturnType<typeof mappingRow>[]): string {
  assert(rows.length === 27 && new Set(rows.map(row => row.circle_slug)).size === 27 && new Set(rows.map(row => row.campaign_id)).size === 27, "Exactly 27 distinct verified rows are required");
  for (const row of rows) assert(validators.validatedCircleTestnetMapping(row, QA_D4_CONTRACT, QA_XLM_SAC), "SQL row failed application validation");
  const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const columns = "network,contract_id,circle_slug,campaign_id,campaign_title,creator_wallet,beneficiary_wallet,token_id,approver_wallets,creator_cut_bps,funding_deadline,review_deadline,purpose,archived_at".split(",");
  const values = rows.map(row => "  (" + [row.network, row.contract_id, row.circle_slug, row.campaign_id, row.campaign_title, row.creator_wallet, row.beneficiary_wallet, row.token_id].map(quote).concat(
    "ARRAY[" + row.approver_wallets.map(quote).join(",") + "]::text[]", String(row.creator_cut_bps), quote(row.funding_deadline), quote(row.review_deadline), quote(row.purpose), "NULL::timestamptz").join(",") + ")").join(",\n");
  const tuple = (alias: string) => "(" + columns.map(column => `${alias}.${column}`).join(",") + ")";
  return "-- VERIFIED D4 TESTNET QA MAPPING. Review the intended Supabase project.\n-- Run separately as a privileged SQL operation; service_role has SELECT only.\n-- Exact reruns skip identical rows. Conflicting immutable mappings abort the transaction.\nbegin;\n" +
    `insert into public.circles_testnet_campaigns (${columns.join(",")})\nselect ${columns.map(column => "expected." + column).join(",")}\nfrom (values\n${values}\n) as expected (${columns.join(",")})\nwhere not exists (select 1 from public.circles_testnet_campaigns existing\n  where ${tuple("existing")} is not distinct from ${tuple("expected")});\ncommit;\n`;
}
function publicJson(value: unknown) { return JSON.stringify(value, (_, item) => typeof item === "bigint" ? item.toString() : item, 2) + "\n"; }
function outsideRepo(path: string): string {
  const absolute = realpathSync(path), root = realpathSync(repoRoot), rel = relative(root, absolute);
  assert(rel === ".." || rel.startsWith(".." + sep) || isAbsolute(rel), "Private QA key file must be outside the repository");
  return absolute;
}
export function createQaRpcServer(): rpc.Server {
  const server = new rpc.Server(QA_RPC);
  // In installed SDK 15.1.0 the RPC constructor does not forward opts.timeout.
  // Every RPC method uses this supported per-instance HTTP client. Add an
  // absolute cancellation deadline as well as Axios timeout, so a slow body
  // cannot keep an otherwise active request open indefinitely.
  server.httpClient.defaults.timeout = QA_RPC_TIMEOUT_MS;
  server.httpClient.defaults.maxRedirects = 0;
  const post = server.httpClient.post.bind(server.httpClient);
  server.httpClient.post = async (url, data, config) => {
    assert.equal(new URL(url).href, new URL(QA_RPC).href, "Unexpected QA RPC transport target");
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), QA_RPC_TIMEOUT_MS);
    try {
      // One post attempt only. Cancellation can leave a send outcome unknown;
      // the durable signed hash must then be reconciled without resubmission.
      // Installed Axios supports AbortSignal; the SDK's narrower config type
      // omits signal, so retain it in this request object passed to that client.
      const request = { ...config, timeout: QA_RPC_TIMEOUT_MS, maxRedirects: 0, signal: controller.signal };
      return await post(url, data, request);
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`QA RPC deadline of ${QA_RPC_TIMEOUT_MS}ms exceeded`);
      throw error;
    } finally { clearTimeout(deadline); }
  };
  return server;
}
function sdkRuntime(plan: QaProvisionPlan, journalPath: string, privateKeyPath?: string): QaProvisionRuntime {
  const server = createQaRpcServer();
  let signer: Keypair | undefined;
  const save = (journal: QaProvisionJournal) => {
    const temporary = journalPath + ".tmp"; writeFileSync(temporary, publicJson(journal), { mode: 0o600, flush: true }); renameSync(temporary, journalPath);
  };
  return {
    network: async () => (await server.getNetwork()).passphrase,
    account: key => server.getAccount(key),
    async read(method, args = []) {
      const encoded = args.map((arg, index) => nativeToScVal(method === "campaigns" && index === 1 ? Number(arg) : arg, { type: method === "campaigns" && index === 1 ? "u32" : "u64" }));
      const tx = new TransactionBuilder(new Account(plan.creatorWallet, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(plan.contractId).call(method, ...encoded)).setTimeout(30).build();
      const result = await server.simulateTransaction(tx);
      assert(!rpc.Api.isSimulationError(result) && result.result, "D4 read simulation failed");
      return scValToNative(result.result.retval);
    },
    async prepare(circle) {
      if (!signer) {
        assert(privateKeyPath, "Execution requires an outside-repo retained QA creator key file");
        const privateFile = JSON.parse(readFileSync(outsideRepo(privateKeyPath), "utf8")) as { creator?: { publicKey?: string; secret?: string } };
        assert(privateFile.creator?.publicKey === plan.creatorWallet && typeof privateFile.creator.secret === "string", "Private QA creator does not match reviewed public manifest");
        signer = Keypair.fromSecret(privateFile.creator.secret);
        assert.equal(signer.publicKey(), plan.creatorWallet, "Private QA creator key mismatch");
      }
      const tx = new TransactionBuilder(await server.getAccount(plan.creatorWallet), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(createOperation(plan, circle)).setTimeout(180).build();
      const simulation = await server.simulateTransaction(tx);
      assert(!rpc.Api.isSimulationError(simulation) && simulation.result, "QA create simulation failed; nothing submitted");
      const prepared = rpc.assembleTransaction(tx, simulation).build(); prepared.sign(signer);
      return { hash: prepared.hash().toString("hex"), envelopeXdr: prepared.toXDR(), simulationLedger: simulation.latestLedger };
    },
    async send(envelope) {
      const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
      assert(tx instanceof Transaction, "Unexpected fee-bump create envelope");
      return server.sendTransaction(tx);
    },
    async transaction(entry, circle) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await server.getTransaction(entry.hash);
        if (result.status === "FAILED") return { status: "FAILED" };
        if (result.status === "SUCCESS") {
          assert(result.returnValue, "Committed create has no campaign ID");
          const id = scValToNative(result.returnValue);
          assert(typeof id === "bigint", "Committed create returned a non-u64 ID");
          verifyCreateEnvelope(plan, circle, entry.hash, result.envelopeXdr.toXDR("base64"));
          assert.equal(result.resultXdr.result().switch().name, "txSuccess", "Committed create did not succeed");
          return { status: "SUCCESS", campaignId: positiveU64(id.toString()), receipt: { hash: entry.hash, ledger: result.ledger,
            envelopeXdr: result.envelopeXdr.toXDR("base64"), resultXdr: result.resultXdr.toXDR("base64"),
            resultMetaXdr: result.resultMetaXdr.toXDR("base64"), returnValueXdr: result.returnValue.toXDR("base64") } };
        }
        if (attempt < 19) await new Promise(done => setTimeout(done, 1500));
      }
      return { status: "NOT_FOUND" };
    }, save,
  };
}
export async function cli(argv = process.argv.slice(2)) {
  const options = new Map<string, string>(); let execute = false, preflight = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--execute") { assert(!execute, "Duplicate execution flag"); execute = true; }
    else if (arg === "--preflight") { assert(!preflight, "Duplicate preflight flag"); preflight = true; }
    else if (["--manifest", "--output-dir", "--creator-secret-file"].includes(arg)) {
      assert(!options.has(arg) && argv[index + 1] && !argv[index + 1].startsWith("--"), "Missing or duplicate argument"); options.set(arg, argv[++index]);
    } else if (arg === "--help") {
      console.log("node --experimental-strip-types scripts/qa-circles-provision.mts --manifest <public.json> [--preflight | --execute --output-dir <public-evidence-dir> --creator-secret-file <outside-repo-private.json>]\nDefault is offline dry run. Execute creates only QA campaigns, with journal/resume. Keys must already be retained privately and all five accounts funded on Testnet. Mapping SQL is staged, never executed."); return;
    } else throw new Error("Unknown provisioning argument");
  }
  assert(options.has("--manifest") && !(execute && preflight), "Provide --manifest and one mode at most");
  assert(execute || !options.has("--creator-secret-file"), "Private keys are accepted only with explicit --execute");
  const plan = buildQaProvisionPlan(JSON.parse(readFileSync(resolve(options.get("--manifest")!), "utf8")));
  if (!execute && !preflight) { console.log(publicJson({ mode: "dry-run", fingerprint: planFingerprint(plan), plan })); return; }
  if (preflight) {
    const existing = await preflightQaProvision(plan, sdkRuntime(plan, ""));
    console.log(publicJson({ mode: "read-only-preflight", fingerprint: planFingerprint(plan), existingCampaignCount: existing.length, plan })); return;
  }
  assert(options.has("--output-dir") && options.has("--creator-secret-file"), "Execution requires explicit public evidence directory and outside-repo private creator key file");
  const output = resolve(options.get("--output-dir")!);
  const privatePath = outsideRepo(resolve(options.get("--creator-secret-file")!));
  mkdirSync(output, { recursive: true });
  const privateRelative = relative(realpathSync(output), privatePath);
  assert(privateRelative === ".." || privateRelative.startsWith(".." + sep) || isAbsolute(privateRelative), "Private keys must be separate from public evidence output");
  const journalPath = resolve(output, "qa-circles-journal.json");
  const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) as QaProvisionJournal : emptyJournal(plan);
  const result = await executeQaProvision(plan, sdkRuntime(plan, journalPath, privatePath), journal);
  writeFileSync(resolve(output, "qa-circles-verified-mapping.json"), publicJson({ fingerprint: planFingerprint(plan), verifiedAt: new Date().toISOString(), rows: result.rows }));
  writeFileSync(resolve(output, "qa-circles-verified-mapping.sql"), mappingInsertSql(result.rows));
  console.log(publicJson({ mode: "executed", fingerprint: planFingerprint(plan), verifiedCampaigns: result.rows.length,
    journalPath, stagedMappingSql: resolve(output, "qa-circles-verified-mapping.sql"), databaseWritten: false }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cli().catch(error => {
    // Do not echo CLI arguments, private JSON, SDK secret errors or stack traces.
    const message = error instanceof Error ? error.message : "QA provisioning failed";
    console.error(message.replace(/S[A-Z2-7]{55}/g, "[redacted-secret]").slice(0, 1200)); process.exitCode = 1;
  });
}
