import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, Address, BASE_FEE, Keypair, Networks, StrKey, TransactionBuilder, nativeToScVal, scValToNative, xdr } from "@stellar/stellar-sdk";
import { campaignStruct } from "../lib/campaign.ts";
import { QA_D4_CONTRACT, QA_XLM_SAC, QA_RPC, QA_RPC_TIMEOUT_MS, buildQaProvisionPlan, createOperation, createQaRpcServer, defaultQaProvisionInput,
  emptyJournal, executeQaProvision, mappingInsertSql, planFingerprint, preflightQaProvision, verifyCreateEnvelope, verifyQaCreateReceipt,
  type QaProvisionCircle, type QaProvisionJournal, type QaProvisionPlan,
  type QaProvisionRuntime, type QaTransactionOutcome } from "./qa-circles-provision.mts";

// Deterministic, unprovisioned test identities. No faucet, remote service,
// actual private-key file, live wallet, database, or transaction is used.
const keys = [1, 2, 3, 4, 5].map(byte => Keypair.fromRawEd25519Seed(Buffer.alloc(32, byte)));
const anchor = 4_000_000_000n;
const input = () => defaultQaProvisionInput({ creatorWallet: keys[0].publicKey(), beneficiaryWallet: keys[1].publicKey(),
  approverWallets: keys.slice(2).map(key => key.publicKey()) }, anchor);
const plan = () => buildQaProvisionPlan(input(), anchor);
function rawCampaign(value: QaProvisionPlan, circle: QaProvisionCircle, id: bigint) {
  return { id, title: circle.title, state: ["Funding"], total: 0n, escrow: 0n, proof_hash: null, proof_url: "", approvals: [],
    config: { creator: value.creatorWallet, beneficiary: value.beneficiaryWallet, token: value.tokenId,
      creator_cut_bps: circle.creatorCutBps, funding_deadline: BigInt(value.fundingDeadline),
      review_deadline: BigInt(value.reviewDeadline), approvers: [...value.approverWallets] } };
}
function committedReceipt(value: QaProvisionPlan, circle: QaProvisionCircle, entry: { hash: string; envelopeXdr: string }, id: bigint) {
  const raw = rawCampaign(value, circle, id), retval = nativeToScVal(id, { type: "u64" });
  const data = campaignStruct({ id: retval, title: nativeToScVal(raw.title, { type: "string" }),
    config: createOperation(value, circle).body().invokeHostFunctionOp().hostFunction().invokeContract().args()[0],
    state: nativeToScVal(["Funding"], { type: ["symbol"] }), total: nativeToScVal(0n, { type: "i128" }),
    escrow: nativeToScVal(0n, { type: "i128" }), proof_hash: xdr.ScVal.scvVoid(), proof_url: nativeToScVal("", { type: "string" }),
    approvals: nativeToScVal([]),
  });
  const created = new xdr.ContractEvent({ ext: new xdr.ExtensionPoint(0), contractId: StrKey.decodeContract(value.contractId) as unknown as xdr.Hash,
    type: xdr.ContractEventType.contract(), body: new xdr.ContractEventBody(0, new xdr.ContractEventV0({
      topics: [nativeToScVal("created", { type: "symbol" }), retval], data,
    })) });
  const meta = new xdr.TransactionMeta(4, new xdr.TransactionMetaV4({ ext: new xdr.ExtensionPoint(0), txChangesBefore: [], txChangesAfter: [],
    sorobanMeta: new xdr.SorobanTransactionMetaV2({ ext: new xdr.SorobanTransactionMetaExt(0), returnValue: retval }), events: [], diagnosticEvents: [],
    operations: [new xdr.OperationMetaV2({ ext: new xdr.ExtensionPoint(0), changes: [], events: [created] })],
  }));
  const result = new xdr.TransactionResult({ feeCharged: xdr.Int64.fromString("100"), ext: new xdr.TransactionResultExt(0),
    result: xdr.TransactionResultResult.txSuccess([xdr.OperationResult.opInner(
      xdr.OperationResultTr.invokeHostFunction(xdr.InvokeHostFunctionResult.invokeHostFunctionSuccess(Buffer.alloc(32))),
    )]),
  });
  return { hash: entry.hash, envelopeXdr: entry.envelopeXdr, ledger: 901, resultXdr: result.toXDR("base64"),
    resultMetaXdr: meta.toXDR("base64"), returnValueXdr: retval.toXDR("base64") };
}
function fakeRuntime(value: QaProvisionPlan, initial: ReturnType<typeof rawCampaign>[] = []) {
  let nextId = 100n, sequence = 0;
  const chain = new Map(initial.map(campaign => [campaign.id.toString(), campaign]));
  const pending = new Map<string, { circle: QaProvisionCircle; id?: string }>();
  const trace: string[] = [], journals: QaProvisionJournal[] = [];
  const counts = { network: 0, read: 0, account: 0, prepare: 0, send: 0, transaction: 0, save: 0 };
  const control = { network: Networks.TESTNET as string, outcome: "SUCCESS" as QaTransactionOutcome["status"], sendError: false };
  const runtime: QaProvisionRuntime = {
    async network() { counts.network++; return control.network; },
    async account() { counts.account++; return {}; },
    async read(method, args = []) {
      counts.read++;
      if (method === "version") return 4;
      if (method === "token") return QA_XLM_SAC;
      if (method === "clock") return anchor;
      if (method === "campaign") { assert(chain.has(args[0].toString())); return chain.get(args[0].toString()); }
      if (method === "campaigns") return [...chain.values()].filter(campaign => args[0] === 0n || campaign.id < args[0])
        .sort((a, b) => a.id > b.id ? -1 : 1).slice(0, Number(args[1]));
      throw new Error("Unexpected mock read");
    },
    async prepare(circle) {
      counts.prepare++; trace.push("prepare:" + circle.circleSlug);
      const tx = new TransactionBuilder(new Account(value.creatorWallet, String(sequence++)), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(createOperation(value, circle)).setTimeout(180).build(); tx.sign(keys[0]);
      const hash = tx.hash().toString("hex"); pending.set(hash, { circle });
      return { hash, envelopeXdr: tx.toXDR(), simulationLedger: 900 };
    },
    async send(envelope) {
      counts.send++;
      const tx = TransactionBuilder.fromXDR(envelope, Networks.TESTNET), hash = tx.hash().toString("hex");
      const previous = journals.at(-1)!.entries.find(entry => entry.hash === hash);
      assert(previous && previous.state === "prepared" && previous.envelopeXdr === envelope, "Signed hash and envelope must be durably saved before send");
      trace.push("send:" + hash);
      if (control.sendError) throw new Error("Injected send connection loss");
      const item = pending.get(hash)!; const id = nextId; nextId += 11n; item.id = id.toString();
      chain.set(id.toString(), rawCampaign(value, item.circle, id));
      return { hash, status: "PENDING" };
    },
    async transaction(entry) {
      counts.transaction++;
      if (control.outcome !== "SUCCESS") return { status: control.outcome };
      const item = pending.get(entry.hash)!;
      return { status: "SUCCESS", campaignId: item.id, receipt: committedReceipt(value, item.circle, entry, BigInt(item.id!)) };
    },
    save(journal) { counts.save++; trace.push("save"); journals.push(JSON.parse(JSON.stringify(journal)) as QaProvisionJournal); },
  };
  return { runtime, counts, control, chain, pending, trace, journals };
}

test("27 exact QA titles, five independent wallets, 30-day funding and seven-day review; no fixture balances become donations", () => {
  const value = plan();
  assert.equal(value.circles.length, 27); assert.equal(new Set(value.circles.map(circle => circle.circleSlug)).size, 27);
  assert(value.circles.every(circle => circle.title === "QA Circles: " + circle.circleSlug));
  assert.equal(BigInt(value.fundingDeadline) - anchor, 30n * 86_400n);
  assert.equal(BigInt(value.reviewDeadline) - BigInt(value.fundingDeadline), 7n * 86_400n);
  const cut = (slug: string) => value.circles.find(circle => circle.circleSlug === slug)!.creatorCutBps;
  assert.equal(cut("tino-relief"), 0); assert.equal(cut("cebu-family-home"), 200);
  assert.equal(cut("ate-mei-dialysis"), 500); assert.equal(cut("creator-baybayin"), 700);
  assert.equal(cut("barangay-library"), 800); assert.equal(cut("bohol-reading-zine"), 1000);
  assert(!JSON.stringify(value).includes("pesoRaised")); assert(!JSON.stringify(value).includes("donorCount"));
  assert.equal(planFingerprint(value), planFingerprint(plan()));
});

test("invalid target, role overlap, noncanonical deadlines and extra secret fields fail closed", () => {
  for (const override of [{ network: "mainnet" }, { contractId: QA_XLM_SAC }, { tokenId: QA_D4_CONTRACT },
    { beneficiaryWallet: keys[0].publicKey() }, { approverWallets: [keys[0].publicKey(), keys[3].publicKey(), keys[4].publicKey()] },
    { approverWallets: [keys[2].publicKey(), keys[2].publicKey(), keys[4].publicKey()] },
    { approverWallets: [keys[2].publicKey(), keys[3].publicKey()] }, { fundingDeadline: "01" },
    { fundingDeadline: anchor.toString() }, { reviewDeadline: input().fundingDeadline },
    { reviewDeadline: (1n << 64n).toString() }, { creatorSecret: "private-placeholder" }]) {
    assert.throws(() => buildQaProvisionPlan({ ...input(), ...override }, anchor));
  }
});

test("SDK encodes exact D4 Symbol-key config, cut, deadlines and title", () => {
  const value = plan(), circle = value.circles.find(item => item.creatorCutBps === 700)!;
  const invoke = createOperation(value, circle).body().invokeHostFunctionOp().hostFunction().invokeContract();
  assert.equal(Address.fromScAddress(invoke.contractAddress()).toString(), value.contractId);
  assert.equal(invoke.functionName().toString(), "create");
  assert.equal(scValToNative(invoke.args()[1]), circle.title);
  const config = scValToNative(invoke.args()[0]);
  assert.equal(config.creator, value.creatorWallet); assert.equal(config.beneficiary, value.beneficiaryWallet);
  assert.equal(config.token, QA_XLM_SAC); assert.equal(config.creator_cut_bps, 700);
  assert.equal(config.funding_deadline, BigInt(value.fundingDeadline)); assert.deepEqual(config.approvers, value.approverWallets);
  assert(invoke.args()[0].map()!.every(entry => entry.key().switch().name === "scvSymbol"));
});

test("signed create envelope binds target, exact terms, creator signature and hash", async () => {
  const value = plan(), mock = fakeRuntime(value), circle = value.circles[0];
  const signed = await mock.runtime.prepare(circle);
  verifyCreateEnvelope(value, circle, signed.hash, signed.envelopeXdr);
  assert.throws(() => verifyCreateEnvelope(value, { ...circle, creatorCutBps: 500 }, signed.hash, signed.envelopeXdr), /exact planned/);
  assert.throws(() => verifyCreateEnvelope(value, circle, "0".repeat(64), signed.envelopeXdr), /hash mismatch/);
  const unsigned = new TransactionBuilder(new Account(value.creatorWallet, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(createOperation(value, circle)).setTimeout(180).build();
  assert.throws(() => verifyCreateEnvelope(value, circle, unsigned.hash().toString("hex"), unsigned.toXDR()), /signature/);
});

test("committed receipt binds exact return metadata and creation event to the planned campaign", async () => {
  const value = plan(), mock = fakeRuntime(value), circle = value.circles[0], signed = await mock.runtime.prepare(circle);
  const receipt = committedReceipt(value, circle, signed, 71n);
  assert.equal(verifyQaCreateReceipt(value, circle, signed.hash, receipt), "71");
  assert.throws(() => verifyQaCreateReceipt(value, circle, signed.hash, { ...receipt, returnValueXdr: nativeToScVal(72n, { type: "u64" }).toXDR("base64") }), /return metadata/);
  assert.throws(() => verifyQaCreateReceipt(value, value.circles[1], signed.hash, receipt), /exact planned/);
  assert.throws(() => verifyQaCreateReceipt(value, circle, signed.hash, { ...receipt, ledger: 0 }), /Incomplete/);
});

test("wrong network and wrong version stop before preparation or sends", async () => {
  const value = plan(), mock = fakeRuntime(value); mock.control.network = Networks.PUBLIC;
  await assert.rejects(executeQaProvision(value, mock.runtime), /not Stellar Testnet/);
  assert.equal(mock.counts.read, 0); assert.equal(mock.counts.send, 0); assert.equal(mock.counts.prepare, 0);
  mock.control.network = Networks.TESTNET;
  const original = mock.runtime.read;
  mock.runtime.read = (method, args) => method === "version" ? Promise.resolve(3) : original(method, args);
  await assert.rejects(executeQaProvision(value, mock.runtime), /not D4 version 4/);
  assert.equal(mock.counts.send, 0); assert.equal(mock.counts.prepare, 0);
});

test("every used SDK RPC method has a 10-second body/request timeout, refuses redirects and never retries send", async () => {
  const server = createQaRpcServer();
  assert.equal(new URL(server.serverURL.toString()).href, new URL(QA_RPC).href);
  assert.equal(server.httpClient.defaults.timeout, 10_000);
  assert.equal(server.httpClient.defaults.maxRedirects, 0);
  const requests: { url: string | undefined; timeout: number | undefined; redirects: number | undefined; method: string }[] = [];
  const rejected = new Error("Injected transport failure; no network request");
  server.httpClient.defaults.adapter = async config => {
    const body = JSON.parse(String(config.data)) as { method: string };
    requests.push({ url: config.url, timeout: config.timeout, redirects: config.maxRedirects, method: body.method });
    throw rejected;
  };
  const value = plan();
  const transaction = new TransactionBuilder(new Account(value.creatorWallet, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(createOperation(value, value.circles[0])).setTimeout(180).build();
  for (const call of [() => server.getNetwork(), () => server.getAccount(value.creatorWallet),
    () => server.simulateTransaction(transaction), () => server.sendTransaction(transaction), () => server.getTransaction("0".repeat(64))]) {
    // getAccount intentionally wraps transport errors as Account not found;
    // the captured adapter attempts below establish that no fallback was sent.
    await assert.rejects(call());
  }
  assert.equal(requests.length, 5, "Each method must make exactly one transport attempt");
  assert.deepEqual(requests.map(request => request.method), ["getNetwork", "getLedgerEntries", "simulateTransaction", "sendTransaction", "getTransaction"]);
  assert(requests.every(request => new URL(request.url!).href === new URL(QA_RPC).href && request.timeout === QA_RPC_TIMEOUT_MS && request.redirects === 0));
  assert.equal(requests.filter(request => request.method === "sendTransaction").length, 1);
});

test("absolute RPC deadline cancels a stalled response body without another transport attempt", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const server = createQaRpcServer(); let attempts = 0, bodyStarted!: () => void;
    const started = new Promise<void>(done => { bodyStarted = done; });
    server.httpClient.defaults.adapter = config => {
      const request = config as typeof config & { signal?: AbortSignal };
      attempts++; assert(request.signal); bodyStarted();
      return new Promise((_, reject) => {
        request.signal!.addEventListener("abort", () => reject(new Error("Injected interrupted body reception")), { once: true });
      });
    };
    const rejection = assert.rejects(server.getNetwork(), /QA RPC deadline of 10000ms exceeded/);
    await started; context.mock.timers.tick(QA_RPC_TIMEOUT_MS); await rejection;
    assert.equal(attempts, 1);
  } finally { context.mock.timers.reset(); }
});

test("all collisions are checked before mutation, including a mismatched 27th circle", async () => {
  const value = plan(), wrong = rawCampaign(value, value.circles.at(-1)!, 8n);
  wrong.config.creator_cut_bps = wrong.config.creator_cut_bps === 0 ? 500 : 0;
  const mock = fakeRuntime(value, [wrong]);
  await assert.rejects(executeQaProvision(value, mock.runtime), /differs from its exact/);
  assert.equal(mock.counts.prepare, 0); assert.equal(mock.counts.send, 0);
  const duplicate = fakeRuntime(value, [rawCampaign(value, value.circles[0], 1n), rawCampaign(value, value.circles[0], 2n)]);
  await assert.rejects(executeQaProvision(value, duplicate.runtime), /Duplicate QA title/);
  assert.equal(duplicate.counts.send, 0);
});

test("create ID comes from confirmed receipt, each hash is saved before send, and identical reruns create nothing", async () => {
  const value = plan(), mock = fakeRuntime(value);
  const result = await executeQaProvision(value, mock.runtime);
  assert.equal(mock.counts.send, 27); assert.equal(mock.counts.prepare, 27); assert.equal(mock.counts.account, 5);
  assert.equal(result.rows[0].campaign_id, "100"); assert.equal(result.rows[1].campaign_id, "111");
  assert.equal(result.journal.entries.length, 27); assert(result.journal.entries.every(entry => entry.state === "confirmed"));
  const before = mock.counts.send; await executeQaProvision(value, mock.runtime, result.journal);
  assert.equal(mock.counts.send, before); assert.equal(mock.counts.prepare, 27);
  assert([...mock.chain.values()].every(campaign => campaign.total === 0n && campaign.escrow === 0n));
  assert(mock.trace.indexOf("save") < mock.trace.findIndex(item => item.startsWith("send:")));
});

test("unknown submitted hash is never sent again, then successful reconciliation resumes remaining circles", async () => {
  const value = plan(), mock = fakeRuntime(value), journal = emptyJournal(value); mock.control.outcome = "NOT_FOUND";
  await assert.rejects(executeQaProvision(value, mock.runtime, journal), /stopped without a second create/);
  assert.equal(mock.counts.send, 1); assert.equal(journal.entries[0].state, "submitted");
  await assert.rejects(executeQaProvision(value, mock.runtime, journal), /stopped without resending/);
  assert.equal(mock.counts.send, 1); assert.equal(mock.counts.prepare, 1);
  mock.control.outcome = "SUCCESS";
  const result = await executeQaProvision(value, mock.runtime, journal);
  assert.equal(mock.counts.send, 27); assert.equal(mock.counts.prepare, 27); assert.equal(result.rows.length, 27);
  assert.equal(result.rows[0].campaign_id, "100");
});

test("connection loss after durable signing leaves a prepared hash and resume never sends it", async () => {
  const value = plan(), mock = fakeRuntime(value), journal = emptyJournal(value); mock.control.sendError = true;
  await assert.rejects(executeQaProvision(value, mock.runtime, journal), /connection loss/);
  assert.equal(journal.entries[0].state, "prepared"); assert.equal(mock.counts.send, 1);
  mock.control.outcome = "NOT_FOUND"; mock.control.sendError = false;
  await assert.rejects(executeQaProvision(value, mock.runtime, journal), /stopped without resending/);
  assert.equal(mock.counts.send, 1); assert.equal(mock.counts.prepare, 1);
});

test("a changed plan or foreign signed journal is rejected before network reads", async () => {
  const value = plan(), mock = fakeRuntime(value), journal = emptyJournal(value);
  journal.fingerprint = "0".repeat(64);
  await assert.rejects(executeQaProvision(value, mock.runtime, journal), /different reviewed/);
  assert.equal(mock.counts.network, 0);
  const changed = { ...value, circles: value.circles.map((circle, index) => index === 0 ? { ...circle, title: "Unlabelled" } : circle) };
  await assert.rejects(executeQaProvision(changed, mock.runtime), /modified after review/);
  assert.equal(mock.counts.network, 0);
});

test("read-only preflight walks the second page without preparing or submitting transactions", async () => {
  const value = plan(), initial = value.circles.map((circle, index) => rawCampaign(value, circle, BigInt(index + 1)));
  const mock = fakeRuntime(value, initial);
  const found = await preflightQaProvision(value, mock.runtime);
  assert.equal(found.length, 27); assert.equal(mock.counts.prepare, 0); assert.equal(mock.counts.send, 0); assert.equal(mock.counts.save, 0);
  const result = await executeQaProvision(value, mock.runtime);
  assert.equal(result.rows.length, 27); assert.equal(mock.counts.send, 0); assert.equal(mock.counts.prepare, 0);
});

test("verified SQL stages all 27 mappings with immutable conflict rejection and exact rerun skipping", async () => {
  const value = plan(), result = await executeQaProvision(value, fakeRuntime(value).runtime);
  const sql = mappingInsertSql(result.rows);
  assert.equal((sql.match(/QA Circles:/g) ?? []).length, 27);
  assert.match(sql, /begin;/); assert.match(sql, /is not distinct from/); assert.match(sql, /commit;/);
  assert.match(sql, /service_role has SELECT only/);
  assert.doesNotMatch(sql, /\b(update|delete|drop|grant)\b/i); assert.doesNotMatch(sql, /on conflict.*update/i);
  assert(!keys.some(key => sql.includes(key.secret())));
  assert.throws(() => mappingInsertSql(result.rows.slice(0, 26)), /27 distinct/);
});

test("default CLI is offline dry run and emits no secret values", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "salapi-qa-provision-test-"));
  try {
    const manifestPath = resolve(directory, "public.json"); writeFileSync(manifestPath, JSON.stringify(input()));
    const output = execFileSync(process.execPath, ["--experimental-strip-types", fileURLToPath(new URL("./qa-circles-provision.mts", import.meta.url)), "--manifest", manifestPath], {
      encoding: "utf8", env: { ...process.env, HTTP_PROXY: "http://127.0.0.1:1", HTTPS_PROXY: "http://127.0.0.1:1" }, stdio: ["ignore", "pipe", "pipe"],
    });
    const dry = JSON.parse(output); assert.equal(dry.mode, "dry-run"); assert.equal(dry.plan.circles.length, 27);
    assert(!keys.some(key => output.includes(key.secret())));
    const source = readFileSync(new URL("./qa-circles-provision.mts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /friendbot\.stellar|sendPayment|\.from\([^)]*circles_testnet|SUPABASE_SERVICE_ROLE/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
