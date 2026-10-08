import "server-only";
import { Address, FeeBumpTransaction, Networks, rpc, scValToNative, StrKey, Transaction, TransactionBuilder, type xdr } from "@stellar/stellar-sdk";
import { createClient, isAuthSessionMissingError, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/supabase/server";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE, supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { CONTRACTS, RPC_URL, donationCampaignId, readContract, txLink } from "@/lib/server/stellar";
import { readActivityIdentities } from "@/lib/server/walletActivityIdentity";
import { XLM_ACTIVITY_ASSET, type WalletActivityItem } from "@/lib/wallet-activity";
import {
  CAMPAIGN_DONOR_ANONYMITY_NOTICE, CAMPAIGN_DONOR_PAGE_SIZE, canonicalDonorCampaignId, campaignDonorComment,
  campaignDonorCursor, campaignDonorHash, parseCampaignDonorInput,
  type CampaignDonorCode, type CampaignDonorEntry, type CampaignDonorFeedResult, type CampaignDonorRecordResult, type CampaignDonorSummaryResult,
} from "@/lib/campaign-donor";

const TABLE = "campaign_donors";
const COLUMNS = "id,network,contract_id,campaign_id,transaction_hash,donor_wallet,owner_id,amount_stroops,ledger,created_at,anonymous,public_profile_ok,comment";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEADLINE_MS = 8_000;
type Row = Record<string, unknown>;
type Receipt = { amountStroops: string; ledger: number; createdAt: string };
type OwnerResult = { ok: true; ownerId: string; wallet: string } | { ok: false; code: CampaignDonorCode };
const object = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);

function context(): SupabaseClient | null {
  if (!supabaseAdminConfigured()) return null;
  try {
    const origin = new URL(SUPABASE_URL);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== "/") return null;
    return createClient(origin.origin, SUPABASE_SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.origin !== origin.origin || url.username || url.password) return Promise.reject(Error("Unexpected donor metadata origin"));
        const timeout = AbortSignal.timeout(DEADLINE_MS);
        return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout, redirect: "error", cache: "no-store" });
      } },
    });
  } catch { return null; }
}
async function bounded<T>(promise: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([Promise.resolve(promise), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Donor lookup timed out")), DEADLINE_MS); })]); }
  finally { if (timer) clearTimeout(timer); }
}
function schemaMissing(error: unknown): boolean {
  return object(error) && ["42P01", "PGRST205"].includes(String(error.code));
}
async function ownerFor(admin: SupabaseClient): Promise<OwnerResult> {
  if (!supabaseConfigured()) return { ok: false, code: "not_configured" };
  try {
    const request = await createSupabaseServer();
    const { data, error } = await bounded(request.auth.getUser());
    if (error) return { ok: false, code: data.user === null && isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" };
    const user = data.user;
    if (user === null) return { ok: false, code: "unauthenticated" };
    if (!user || typeof user.id !== "string" || !UUID.test(user.id) || user.is_anonymous !== false) return { ok: false, code: "unauthenticated" };
    // Metadata reconciliation is read-only custody lookup. Never select secret
    // ciphertext, provision a wallet, or silently use the shared demo wallet.
    const saved = await admin.from("wallets").select("public_key").eq("user_id", user.id).abortSignal(AbortSignal.timeout(DEADLINE_MS)).maybeSingle();
    if (saved.error) return { ok: false, code: "unavailable" };
    if (saved.data === null) return { ok: false, code: "no_wallet" };
    return typeof saved.data?.public_key === "string" && StrKey.isValidEd25519PublicKey(saved.data.public_key)
      ? { ok: true, ownerId: user.id, wallet: saved.data.public_key } : { ok: false, code: "unavailable" };
  } catch (error) { return { ok: false, code: isAuthSessionMissingError(error) ? "unauthenticated" : "unavailable" }; }
}
async function deployment(contractId: string) {
  const [version, token] = await bounded(Promise.all([readContract(contractId, "version"), readContract(contractId, "token")]));
  if (version !== 4 || token !== CONTRACTS.tokenXlmSac) throw Error("Configured deployment is not D4 Testnet XLM");
}

function committedEvents(meta: xdr.TransactionMeta): xdr.ContractEvent[] {
  // Diagnostic events can describe failed invocations and are NEVER proof.
  if (meta.switch() === 3) return meta.v3().sorobanMeta()?.events() ?? [];
  if (meta.switch() === 4) return meta.v4().operations().flatMap(operation => operation.events());
  return [];
}

function receiptEpochSeconds(value: unknown): number | null {
  // RPC timestamps can remain decimal strings after SDK decoding. Never coerce
  // whitespace, signs, fractions, exponents, or noncanonical leading zeroes.
  const seconds = typeof value === "number" ? value
    : typeof value === "string" && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(seconds) && seconds > 0 && Number.isSafeInteger(seconds * 1000) ? seconds : null;
}

/** Decode only a successful, exact D4 donation receipt. The amount is this
 * invocation's i128, corroborated by its committed donated event, never the
 * caller's amount or the wallet's accumulated campaign contribution.
 */
export function verifyCampaignDonationReceipt(response: rpc.Api.GetTransactionResponse, hash: string, contractId: string,
  campaignId: string, wallet: string, nowMs = Date.now()): Receipt | null {
  try {
    if (response.status !== "SUCCESS") return null;
    const createdAt = receiptEpochSeconds(response.createdAt);
    if (response.txHash !== hash || !campaignDonorHash(hash)
      || !StrKey.isValidContract(contractId) || !StrKey.isValidEd25519PublicKey(wallet) || !canonicalDonorCampaignId(campaignId)
      || !Number.isSafeInteger(response.ledger) || response.ledger <= 0 || response.ledger > 4_294_967_295
      || createdAt === null || createdAt * 1000 > nowMs + 300_000) return null;
    const outer = TransactionBuilder.fromXDR(response.envelopeXdr.toXDR("base64"), Networks.TESTNET);
    if (outer.hash().toString("hex") !== hash || response.feeBump !== (outer instanceof FeeBumpTransaction)) return null;
    const tx = outer instanceof FeeBumpTransaction ? outer.innerTransaction : outer;
    if (!(tx instanceof Transaction) || tx.source !== wallet || tx.operations.length !== 1) return null;
    const result = response.resultXdr.result();
    if (outer instanceof FeeBumpTransaction) {
      if (result.switch().name !== "txFeeBumpInnerSuccess" || result.innerResultPair().result().result().switch().name !== "txSuccess"
        || !Buffer.from(result.innerResultPair().transactionHash() as unknown as Uint8Array).equals(tx.hash())) return null;
    } else if (result.switch().name !== "txSuccess") return null;
    const execution = outer instanceof FeeBumpTransaction ? result.innerResultPair().result().result() : result;
    const operationResults = execution.results();
    if (operationResults.length !== 1 || operationResults[0].switch().name !== "opInner"
      || operationResults[0].tr().switch().name !== "invokeHostFunction"
      || operationResults[0].tr().invokeHostFunctionResult().switch().name !== "invokeHostFunctionSuccess") return null;
    const operation = tx.operations[0];
    if (operation.type !== "invokeHostFunction" || (operation.source && operation.source !== wallet)
      || operation.func.switch().name !== "hostFunctionTypeInvokeContract") return null;
    const invocation = operation.func.invokeContract();
    if (Address.fromScAddress(invocation.contractAddress()).toString() !== contractId || invocation.functionName().toString() !== "donate") return null;
    const args = invocation.args();
    if (args.length !== 3 || args[0].switch().name !== "scvU64" || args[1].switch().name !== "scvAddress" || args[2].switch().name !== "scvI128"
      || String(scValToNative(args[0])) !== campaignId || Address.fromScVal(args[1]).toString() !== wallet) return null;
    const amount = scValToNative(args[2]);
    if (typeof amount !== "bigint" || amount <= 0n || amount > 170_141_183_460_469_231_731_687_303_715_884_105_727n) return null;
    const events = committedEvents(response.resultMetaXdr);
    if (events.length > 256) return null;
    const matching = events.filter(event => {
      if (event.type().name !== "contract" || !event.contractId() || StrKey.encodeContract(Buffer.from(event.contractId()! as unknown as Uint8Array)) !== contractId || event.body().switch() !== 0) return false;
      const body = event.body().v0(), topics = body.topics();
      return topics.length === 3 && topics[0].switch().name === "scvSymbol" && scValToNative(topics[0]) === "donated"
        && topics[1].switch().name === "scvU64" && String(scValToNative(topics[1])) === campaignId
        && topics[2].switch().name === "scvAddress" && Address.fromScVal(topics[2]).toString() === wallet
        && body.data().switch().name === "scvI128" && scValToNative(body.data()) === amount;
    });
    if (matching.length !== 1) return null;
    return { amountStroops: amount.toString(), ledger: response.ledger, createdAt: new Date(createdAt * 1000).toISOString() };
  } catch { return null; }
}

function validRow(value: unknown, contractId: string, campaignId: string): value is Row {
  if (!object(value)) return false;
  // PostgREST serializes bigint identity columns as JSON numbers. Reject an
  // unsafe rounded number; canonical string cursors remain lossless.
  const id = typeof value.id === "number" && Number.isSafeInteger(value.id) && value.id > 0 ? String(value.id) : value.id;
  return campaignDonorCursor(id) && value.network === "testnet" && value.contract_id === contractId && value.campaign_id === campaignId
    && campaignDonorHash(value.transaction_hash) && typeof value.donor_wallet === "string" && StrKey.isValidEd25519PublicKey(value.donor_wallet)
    && (value.owner_id === null || typeof value.owner_id === "string" && UUID.test(value.owner_id))
    && typeof value.amount_stroops === "string" && /^[1-9]\d{0,38}$/.test(value.amount_stroops)
    && BigInt(value.amount_stroops) <= 170_141_183_460_469_231_731_687_303_715_884_105_727n
    && Number.isSafeInteger(value.ledger) && Number(value.ledger) > 0 && Number(value.ledger) <= 4_294_967_295
    && typeof value.created_at === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value.created_at)
    && Number.isFinite(Date.parse(value.created_at)) && typeof value.anonymous === "boolean" && typeof value.public_profile_ok === "boolean"
    && !(value.anonymous && value.public_profile_ok)
    && campaignDonorComment(value.comment) === value.comment;
}
function receiptRow(admin: SupabaseClient, contractId: string, hash: string) {
  return admin.from(TABLE).select(COLUMNS).eq("network", "testnet").eq("contract_id", contractId).eq("transaction_hash", hash)
    .abortSignal(AbortSignal.timeout(DEADLINE_MS)).maybeSingle();
}

/** Idempotent immutable metadata insert. Retrying this action cannot move money.
 * A lost DB response returns metadata-only retry; uniqueness reconciles a save
 * that may already have succeeded. No upsert can reassign another receipt.
 */
export async function recordCampaignDonor(inputId: unknown, input: unknown): Promise<CampaignDonorRecordResult> {
  const campaignId = canonicalDonorCampaignId(inputId) ?? "", parsed = parseCampaignDonorInput(input);
  const hash = parsed?.hash ?? null;
  const fail = (code: CampaignDonorCode, donationConfirmed = false): CampaignDonorRecordResult => ({ ok: false, code, campaignId, hash,
    donationConfirmed, retryMetadataOnly: hash !== null && ["confirmation_unavailable", "not_configured", "metadata_unavailable", "unavailable"].includes(code) });
  if (!campaignId) return fail("invalid_campaign");
  if (!parsed) return fail("invalid_input");
  if (isLocalPreview) return fail("local_preview");
  const contractId = donationCampaignId(), admin = context();
  if (!contractId || !admin) return fail("not_configured");
  const owner = await ownerFor(admin);
  if (!owner.ok) return fail(owner.code);
  if (owner.ownerId !== parsed.expectedOwnerId) return fail("account_changed");
  const success = (status: "recorded" | "already_recorded"): CampaignDonorRecordResult => ({ ok: true, status, ownerId: owner.ownerId, campaignId, hash: parsed.hash });
  const sameReceipt = (row: unknown) => validRow(row, contractId, campaignId) && row.transaction_hash === parsed.hash && row.owner_id === owner.ownerId && row.donor_wallet === owner.wallet;
  let existingError: unknown = null;
  try {
    const existing = await receiptRow(admin, contractId, parsed.hash);
    existingError = existing.error;
    if (!existing.error && existing.data !== null) return sameReceipt(existing.data) ? success("already_recorded") : fail("receipt_mismatch");
  } catch { existingError = Error("Metadata lookup unavailable"); }
  let receipt: Receipt | null;
  try {
    await deployment(contractId);
    const server = new rpc.Server(RPC_URL, { timeout: DEADLINE_MS });
    if ((await bounded(server.getNetwork())).passphrase !== Networks.TESTNET) return fail("receipt_mismatch");
    const response = await bounded(server.getTransaction(parsed.hash));
    if (response.status === "NOT_FOUND") return fail("confirmation_unavailable");
    if (response.status === "FAILED") return fail("failed_receipt");
    receipt = verifyCampaignDonationReceipt(response, parsed.hash, contractId, campaignId, owner.wallet);
    if (!receipt) return fail("receipt_mismatch");
  } catch { return fail("confirmation_unavailable"); }
  if (existingError) return fail(schemaMissing(existingError) ? "not_configured" : "metadata_unavailable", true);
  try {
    const saved = await admin.from(TABLE).insert({ network: "testnet", contract_id: contractId, campaign_id: campaignId,
      transaction_hash: parsed.hash, donor_wallet: owner.wallet, owner_id: owner.ownerId, amount_stroops: receipt.amountStroops,
      ledger: receipt.ledger, created_at: receipt.createdAt, anonymous: parsed.anonymous, public_profile_ok: parsed.publicProfileOk, comment: parsed.comment })
      .select(COLUMNS).abortSignal(AbortSignal.timeout(DEADLINE_MS)).single();
    if (saved.error) {
      if (saved.error.code === "23505") {
        const duplicate = await receiptRow(admin, contractId, parsed.hash);
        return !duplicate.error && sameReceipt(duplicate.data) ? success("already_recorded") : fail("receipt_mismatch", true);
      }
      return fail(schemaMissing(saved.error) ? "not_configured" : "metadata_unavailable", true);
    }
    if (!sameReceipt(saved.data) || saved.data.amount_stroops !== receipt.amountStroops || Number(saved.data.ledger) !== receipt.ledger
      || Date.parse(saved.data.created_at) !== Date.parse(receipt.createdAt) || saved.data.anonymous !== parsed.anonymous
      || saved.data.public_profile_ok !== parsed.publicProfileOk || saved.data.comment !== parsed.comment) return fail("metadata_unavailable", true);
    return success("recorded");
  } catch { return fail("metadata_unavailable", true); }
}

/** Anonymous participants never reach registry/photo lookups or the returned
 * payload. Public amounts/time can correlate with public chain data, so the
 * display-anonymity notice is part of every successful feed response.
 */
export async function readCampaignDonors(inputId: unknown, before: unknown = ""): Promise<CampaignDonorFeedResult> {
  const campaignId = canonicalDonorCampaignId(inputId) ?? "";
  const fail = (code: CampaignDonorCode): CampaignDonorFeedResult => ({ ok: false, campaignId, code });
  if (!campaignId) return fail("invalid_campaign");
  if (before !== "" && !campaignDonorCursor(before)) return fail("invalid_cursor");
  if (isLocalPreview) return fail("local_preview");
  const contractId = donationCampaignId(), admin = context();
  if (!contractId || !admin) return fail("not_configured");
  try {
    let query = admin.from(TABLE).select(COLUMNS).eq("network", "testnet").eq("contract_id", contractId).eq("campaign_id", campaignId)
      .order("id", { ascending: false }).limit(CAMPAIGN_DONOR_PAGE_SIZE + 1);
    if (before !== "") query = query.lt("id", before);
    const { data, error } = await query.abortSignal(AbortSignal.timeout(DEADLINE_MS));
    if (error) return fail(schemaMissing(error) ? "not_configured" : "unavailable");
    if (!Array.isArray(data) || data.length > CAMPAIGN_DONOR_PAGE_SIZE + 1 || data.some(row => !validRow(row, contractId, campaignId))) return fail("unavailable");
    // A cursor cannot escape the configured campaign or return out-of-order
    // duplicates, even if a stale schema/query response behaves unexpectedly.
    if (data.some((row, index) => before !== "" && BigInt(row.id) >= BigInt(before as string)
      || index > 0 && BigInt(row.id) >= BigInt(data[index - 1].id))) return fail("unavailable");
    await deployment(contractId);
    const page = data.slice(0, CAMPAIGN_DONOR_PAGE_SIZE);
    // Receipt-party photo permission is not permission to publish a donor
    // profile. A separate per-donation checkbox is persisted before any public
    // identity lookup. This donation consent, not the unrelated private-receipt
    // preference, grants account-photo access for the bound donor owner only.
    const visible = page.filter(row => row.anonymous === false && row.public_profile_ok === true);
    const photoOwners = new Map<string, string>();
    const conflictingOwners = new Set<string>();
    for (const row of visible) {
      if (!row.owner_id) continue;
      if (photoOwners.has(row.donor_wallet) && photoOwners.get(row.donor_wallet) !== row.owner_id) conflictingOwners.add(row.donor_wallet);
      photoOwners.set(row.donor_wallet, row.owner_id);
    }
    for (const wallet of conflictingOwners) photoOwners.delete(wallet);
    let identities: Awaited<ReturnType<typeof readActivityIdentities>> = [];
    if (visible.length) {
      try { identities = await readActivityIdentities(visible[0].donor_wallet, visible.map(row => ({
        id: String(row.id), hash: row.transaction_hash, createdAt: row.created_at, direction: "received", amountStroops: row.amount_stroops,
        asset: XLM_ACTIVITY_ASSET, fee: { status: "unavailable" }, counterparty: row.donor_wallet, kind: "soroban-transfer",
      } as WalletActivityItem)), photoOwners); } catch { /* Optional profile failure never hides a confirmed receipt. */ }
    }
    const entries: CampaignDonorEntry[] = page.map(row => {
      const anonymous = row.anonymous === true;
      const identity = anonymous || row.public_profile_ok !== true ? null : identities.find(item => item.address === row.donor_wallet);
      return { id: String(row.id), network: "testnet", campaignId, createdAt: row.created_at, amountStroops: row.amount_stroops,
        asset: "XLM", badge: "confirmed_testnet", anonymous, comment: row.comment,
        donor: anonymous ? null : { address: row.donor_wallet, handle: identity?.handle ?? null, photoUrl: identity?.photoUrl ?? null },
        hash: anonymous ? null : row.transaction_hash, link: anonymous ? null : txLink(row.transaction_hash) };
    });
    return { ok: true, campaignId, entries, nextCursor: data.length > CAMPAIGN_DONOR_PAGE_SIZE ? entries.at(-1)!.id : null,
      anonymityNotice: CAMPAIGN_DONOR_ANONYMITY_NOTICE };
  } catch { return fail("unavailable"); }
}

const SUMMARY_PAGE_SIZE = 250;
const SUMMARY_MAX_PAGES = 20;
const SUMMARY_TIMEOUT_MS = 2_500;
const SUMMARY_CACHE_MS = 30_000;
const summaryCache = new Map<string, { expires: number; value: Promise<CampaignDonorSummaryResult> }>();

/** Called only after the public Circle reader verified this configured D4
 * deployment and its cumulative total. No auth/profile lookup or raw identity
 * leaves this function. Scan all metadata pages, not the ten-row public feed.
 * Missing metadata never invents donors or turns a partial scan into an exact
 * count. A bounded scan that cannot finish is explicitly unavailable. */
export async function readCampaignDonorSummary(inputId: unknown, confirmedTotal: unknown): Promise<CampaignDonorSummaryResult> {
  const campaignId = canonicalDonorCampaignId(inputId) ?? "";
  const fail = (code: CampaignDonorCode): CampaignDonorSummaryResult => ({ ok: false, campaignId, code });
  if (!campaignId || typeof confirmedTotal !== "string" || !/^(?:0|[1-9]\d{0,38})$/.test(confirmedTotal)
    || BigInt(confirmedTotal) > 170_141_183_460_469_231_731_687_303_715_884_105_727n) return fail("invalid_input");
  if (isLocalPreview) return fail("local_preview");
  const contractId = donationCampaignId(), admin = context();
  if (!contractId || !StrKey.isValidContract(contractId) || !admin) return fail("not_configured");
  const now = Date.now(), key = `${contractId}:${campaignId}:${confirmedTotal}`;
  for (const [cacheKey, cached] of summaryCache) if (cached.expires <= now) summaryCache.delete(cacheKey);
  const cached = summaryCache.get(key);
  if (cached) return cached.value;
  while (summaryCache.size >= 64) summaryCache.delete(summaryCache.keys().next().value!);
  const value = (async (): Promise<CampaignDonorSummaryResult> => {
    const signal = AbortSignal.timeout(SUMMARY_TIMEOUT_MS);
    try {
      let before = "", total = 0n, finished = false;
      const owners = new Set<string>(), walletOwners = new Map<string, Set<string>>(), unownedWallets = new Set<string>();
      const hashes = new Set<string>();
      for (let page = 0; page < SUMMARY_MAX_PAGES; page++) {
        let query = admin.from(TABLE).select(COLUMNS).eq("network", "testnet").eq("contract_id", contractId).eq("campaign_id", campaignId)
          .order("id", { ascending: false }).limit(SUMMARY_PAGE_SIZE);
        if (before) query = query.lt("id", before);
        const { data, error } = await query.abortSignal(signal);
        if (error) return fail(schemaMissing(error) ? "not_configured" : "unavailable");
        if (!Array.isArray(data) || data.length > SUMMARY_PAGE_SIZE || data.some(row => !validRow(row, contractId, campaignId))) return fail("unavailable");
        for (let index = 0; index < data.length; index++) {
          const row = data[index];
          if (before && BigInt(row.id) >= BigInt(before) || index > 0 && BigInt(row.id) >= BigInt(data[index - 1].id)
            || hashes.has(row.transaction_hash)) return fail("unavailable");
          hashes.add(row.transaction_hash);
          total += BigInt(row.amount_stroops);
          if (row.owner_id) {
            const ownerId = row.owner_id.toLowerCase();
            owners.add(ownerId);
            const known = walletOwners.get(row.donor_wallet) ?? new Set<string>();
            known.add(ownerId); walletOwners.set(row.donor_wallet, known);
          } else unownedWallets.add(row.donor_wallet);
        }
        if (data.length < SUMMARY_PAGE_SIZE) { finished = true; break; }
        before = String(data.at(-1)!.id);
      }
      if (!finished || signal.aborted || total > BigInt(confirmedTotal)) return fail("unavailable");
      // A deleted owner can leave earlier rows without an owner. Fold these
      // into their single known account when possible; ambiguous bindings must
      // not claim an exact contributor count.
      if ([...unownedWallets].some(wallet => (walletOwners.get(wallet)?.size ?? 0) > 1)) return fail("unavailable");
      const walletFallbacks = [...unownedWallets].filter(wallet => !walletOwners.has(wallet)).length;
      return { ok: true, campaignId, count: owners.size + walletFallbacks,
        basis: walletFallbacks === 0 ? "accounts" : owners.size === 0 ? "wallets" : "mixed",
        coverage: total === BigInt(confirmedTotal) ? "complete" : "recorded", confirmedTotalStroops: confirmedTotal };
    } catch { return fail("unavailable"); }
  })();
  summaryCache.set(key, { expires: now + SUMMARY_CACHE_MS, value });
  return value;
}
