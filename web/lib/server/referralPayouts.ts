import "server-only";

import { randomUUID } from "node:crypto";
import { Account, Asset, Horizon, Keypair, Networks, Operation, StrKey, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { readOwnReferral } from "@/lib/server/referrals";
import { currentUserId, getAuthenticatedSigner } from "@/lib/server/userWallet";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const USDC_CODE = "USDC";
const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const REWARD_UNITS = 200_000_000n;
const REWARD_AMOUNT = "20.0000000";
const MAX_REQUEST_MS = 10_000;
const CLAIM_LEASE_MS = 120_000;
const TABLE = "referral_reward_payouts";
const LOCK_TABLE = "referral_reward_treasury_lock";
const TREASURY_LEASE_MS = 180_000;

type Balance = { asset_type?: unknown; asset_code?: unknown; asset_issuer?: unknown; balance?: unknown };
type AccountData = { account_id: string; sequence: string; balances: Balance[] };
type RewardRow = { owner_id: string; status: string; treasury_public_key: string | null; recipient_wallet: string | null; transaction_hash: string | null; transaction_xdr: string | null; lease_token: string | null; lease_until: string | null };
type ActionStatus = "paid" | "pending" | "trustline_pending" | "not_eligible" | "trustline_required" | "trustline_ready" | "wallet_not_ready" | "treasury_unconfigured" | "treasury_unfunded" | "busy" | "failed" | "unavailable" | "unauthenticated";
export type ReferralRewardActionResult = { status: ActionStatus; hash?: string | null };

function withDeadline<T>(task: PromiseLike<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    Promise.resolve(task),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(label)), MAX_REQUEST_MS); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

async function getJson(path: string): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${HORIZON_URL}${path}`, { cache: "no-store", redirect: "error", signal: controller.signal });
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > 262_144) throw new Error("Horizon response too large");
    if (response.status === 404) return { status: 404, body: null };
    if (!response.ok) return { status: response.status, body: null };
    return { status: response.status, body: await response.json() as unknown };
  } finally { clearTimeout(timer); }
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validBalance(value: unknown): value is Balance {
  return object(value);
}

function usdcUnits(account: AccountData): bigint | null {
  const row = account.balances.find(balance => balance.asset_type === "credit_alphanum4"
    && balance.asset_code === USDC_CODE && balance.asset_issuer === USDC_ISSUER);
  if (!row || typeof row.balance !== "string" || !/^(?:0|[1-9]\d{0,15})(?:\.\d{1,7})?$/.test(row.balance)) return null;
  const [whole, fraction = ""] = row.balance.split(".");
  return BigInt(whole) * 10_000_000n + BigInt((fraction + "0000000").slice(0, 7));
}

function decimalUnits(value: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,7})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000_000n + BigInt((fraction + "0000000").slice(0, 7));
}

async function accountData(publicKey: string): Promise<AccountData | null> {
  const { status, body } = await getJson(`/accounts/${encodeURIComponent(publicKey)}`);
  if (status === 404) return null;
  if (status !== 200 || !object(body) || body.account_id !== publicKey || typeof body.sequence !== "string"
    || !/^(?:0|[1-9]\d{0,19})$/.test(body.sequence) || !Array.isArray(body.balances) || body.balances.length > 1000
    || !body.balances.every(validBalance)) throw new Error("Testnet account lookup failed");
  return { account_id: publicKey, sequence: body.sequence, balances: body.balances };
}

async function verifyTestnet(): Promise<boolean> {
  const { status, body } = await getJson("/");
  return status === 200 && object(body) && body.network_passphrase === Networks.TESTNET;
}

function hasUsdcTrustline(account: AccountData): boolean {
  return account.balances.some(balance => balance.asset_type === "credit_alphanum4"
    && balance.asset_code === USDC_CODE && balance.asset_issuer === USDC_ISSUER);
}

function treasuryConfig(): { publicKey: string; keypair: Keypair } | null {
  const secret = process.env.REFERRAL_REWARD_TREASURY_SECRET?.trim();
  const publicKey = process.env.REFERRAL_REWARD_TREASURY_PUBLIC?.trim();
  if (!secret || !publicKey) return null;
  try {
    const keypair = Keypair.fromSecret(secret);
    return keypair.publicKey() === publicKey ? { publicKey, keypair } : null;
  } catch { return null; }
}

async function updateReward(admin: ReturnType<typeof createSupabaseAdmin>, ownerId: string, patch: Record<string, unknown>, expected: { status: string; token?: string | null; hash?: string | null }) {
  let query = admin.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("owner_id", ownerId).eq("status", expected.status);
  if (expected.token !== undefined) query = query.eq("lease_token", expected.token);
  if (expected.hash !== undefined) query = query.eq("transaction_hash", expected.hash);
  return query.select("owner_id,status,treasury_public_key,recipient_wallet,transaction_hash,transaction_xdr,lease_token,lease_until").maybeSingle();
}

async function rewardRow(admin: ReturnType<typeof createSupabaseAdmin>, ownerId: string): Promise<RewardRow | null> {
  const { data, error } = await admin.from(TABLE).select("owner_id,status,treasury_public_key,recipient_wallet,transaction_hash,transaction_xdr,lease_token,lease_until")
    .eq("owner_id", ownerId).abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (error) throw new Error("Reward status unavailable");
  if (!data) return null;
  if (typeof data.status !== "string" || !["pending", "preparing", "submitted", "paid", "failed"].includes(data.status)
    || typeof data.owner_id !== "string") throw new Error("Invalid reward status");
  return data as RewardRow;
}

async function acquireTreasuryLease(admin: ReturnType<typeof createSupabaseAdmin>, token: string): Promise<boolean> {
  const current = await admin.from(LOCK_TABLE).select("lease_token,lease_until").eq("lock_id", 1)
    .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
  if (current.error || !current.data) return false;
  const leaseUntil = current.data.lease_until;
  if (leaseUntil !== null && (typeof leaseUntil !== "string" || !Number.isFinite(Date.parse(leaseUntil)))) return false;
  if (leaseUntil && Date.parse(leaseUntil) > Date.now()) return false;
  let update = admin.from(LOCK_TABLE).update({ lease_token: token,
    lease_until: new Date(Date.now() + TREASURY_LEASE_MS).toISOString(), updated_at: new Date().toISOString() }).eq("lock_id", 1);
  if (current.data.lease_token === null) update = update.is("lease_token", null).is("lease_until", null);
  else if (typeof current.data.lease_token === "string" && leaseUntil) update = update.eq("lease_token", current.data.lease_token).eq("lease_until", leaseUntil);
  else return false;
  const result = await update.select("lease_token").maybeSingle();
  return !result.error && result.data?.lease_token === token;
}

async function releaseTreasuryLease(admin: ReturnType<typeof createSupabaseAdmin>, token: string) {
  await admin.from(LOCK_TABLE).update({ lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
    .eq("lock_id", 1).eq("lease_token", token).abortSignal(AbortSignal.timeout(4000));
}

async function transactionStatus(hash: string): Promise<"success" | "failed" | "missing" | "unknown"> {
  try {
    const { status, body } = await getJson(`/transactions/${hash}`);
    if (status === 404) return "missing";
    if (status !== 200 || !object(body) || body.hash !== hash || typeof body.successful !== "boolean") return "unknown";
    return body.successful ? "success" : "failed";
  } catch { return "unknown"; }
}

function validPayoutEnvelope(envelope: string, hash: string, treasury: string, destination: string): Transaction | null {
  try {
    const transaction = TransactionBuilder.fromXDR(envelope, Networks.TESTNET);
    if (!(transaction instanceof Transaction) || transaction.networkPassphrase !== Networks.TESTNET
      || transaction.source !== treasury || transaction.operations.length !== 1 || transaction.signatures.length !== 1
      || transaction.memo.type !== "none" || !transaction.timeBounds
      || !/^(?:0|[1-9]\d{0,15})$/.test(transaction.timeBounds.minTime)
      || !/^[1-9]\d{0,15}$/.test(transaction.timeBounds.maxTime)
      || Number(transaction.timeBounds.maxTime) <= Number(transaction.timeBounds.minTime)
      || transaction.hash().toString("hex") !== hash || (transaction.extraSigners?.length ?? 0) !== 0) return null;
    const signer = Keypair.fromPublicKey(treasury);
    if (!signer.verify(transaction.hash(), transaction.signatures[0].signature())) return null;
    const operation = transaction.operations[0];
    if (operation.type !== "payment" || operation.destination !== destination || decimalUnits(operation.amount) !== REWARD_UNITS
      || operation.asset.code !== USDC_CODE || operation.asset.issuer !== USDC_ISSUER) return null;
    return transaction;
  } catch { return null; }
}

async function reconcileOrSubmit(
  admin: ReturnType<typeof createSupabaseAdmin>, row: RewardRow, heldLease?: string,
): Promise<ReferralRewardActionResult> {
  if (!row.transaction_hash || !row.transaction_xdr || !row.treasury_public_key || !row.recipient_wallet
    || !StrKey.isValidEd25519PublicKey(row.treasury_public_key) || !StrKey.isValidEd25519PublicKey(row.recipient_wallet))
    return { status: "unavailable" };
  const tx = validPayoutEnvelope(row.transaction_xdr, row.transaction_hash, row.treasury_public_key, row.recipient_wallet);
  if (!tx) return { status: "unavailable", hash: row.transaction_hash };

  let status = await transactionStatus(row.transaction_hash);
  if (status === "success") {
    await updateReward(admin, row.owner_id, { status: "paid", lease_token: null, lease_until: null }, { status: "submitted", hash: row.transaction_hash });
    if (heldLease) await releaseTreasuryLease(admin, heldLease);
    return { status: "paid", hash: row.transaction_hash };
  }
  if (status === "failed") {
    await updateReward(admin, row.owner_id, { status: "failed", lease_token: null, lease_until: null }, { status: "submitted", hash: row.transaction_hash });
    if (heldLease) await releaseTreasuryLease(admin, heldLease);
    return { status: "failed", hash: row.transaction_hash };
  }
  if (status === "unknown" || Number(tx.timeBounds?.maxTime) <= Math.floor(Date.now() / 1000))
    return { status: "pending", hash: row.transaction_hash };

  const leaseToken = heldLease ?? randomUUID();
  if (!heldLease && !(await acquireTreasuryLease(admin, leaseToken))) return { status: "pending", hash: row.transaction_hash };

  // Re-submit only the identical, already-persisted envelope. Stellar's hash
  // and source sequence make this retry idempotent; a new payment is never built
  // while an earlier one is unconfirmed.
  try {
    const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: false });
    await withDeadline(horizon.submitTransaction(tx), "Testnet payout submission timed out");
  } catch { /* A lost response is reconciled by the same transaction hash. */ }
  status = await transactionStatus(row.transaction_hash);
  if (status === "success") {
    await updateReward(admin, row.owner_id, { status: "paid", lease_token: null, lease_until: null }, { status: "submitted", hash: row.transaction_hash });
    await releaseTreasuryLease(admin, leaseToken);
    return { status: "paid", hash: row.transaction_hash };
  }
  if (status === "failed") {
    await updateReward(admin, row.owner_id, { status: "failed", lease_token: null, lease_until: null }, { status: "submitted", hash: row.transaction_hash });
    await releaseTreasuryLease(admin, leaseToken);
    return { status: "failed", hash: row.transaction_hash };
  }
  return { status: "pending", hash: row.transaction_hash };
}

/** Create the Testnet USDC trustline only after the user explicitly asks for it. */
export async function setupReferralUsdcTrustline(): Promise<ReferralRewardActionResult> {
  const ownerId = await currentUserId();
  if (!ownerId) return { status: "unauthenticated" };
  try {
    const referral = await readOwnReferral();
    if (referral.status !== "ready" || referral.progressStatus !== "ready") return { status: "unavailable" };
    if (referral.qualifiedCount < 10 || referral.rewardStatus === "paid" || referral.rewardStatus === "failed") return { status: "not_eligible" };
    const signer = await getAuthenticatedSigner(ownerId);
    if (!(await verifyTestnet())) return { status: "unavailable" };
    const account = await accountData(signer.publicKey);
    if (!account) return { status: "wallet_not_ready" };
    if (hasUsdcTrustline(account)) return { status: "trustline_ready" };
    const transaction = new TransactionBuilder(new Account(signer.publicKey, account.sequence), {
      fee: "100", networkPassphrase: Networks.TESTNET,
    }).addOperation(Operation.changeTrust({ asset: new Asset(USDC_CODE, USDC_ISSUER) })).setTimeout(120).build();
    transaction.sign(Keypair.fromSecret(signer.secret));
    const horizon = new Horizon.Server(HORIZON_URL, { allowHttp: false });
    try { await withDeadline(horizon.submitTransaction(transaction), "USDC trustline transaction timed out"); }
    catch {
      const confirmation = await accountData(signer.publicKey).catch(() => null);
      return { status: confirmation && hasUsdcTrustline(confirmation) ? "trustline_ready" : "trustline_pending" };
    }
    const confirmation = await accountData(signer.publicKey).catch(() => null);
    return { status: confirmation && hasUsdcTrustline(confirmation) ? "trustline_ready" : "trustline_pending" };
  } catch { return { status: "unavailable" }; }
}

/** Pay exactly once after ten distinct referred accounts each have verified
 * D4 Testnet donations worth at least $5 at the fresh market quote. */
export async function claimReferralReward(): Promise<ReferralRewardActionResult> {
  const ownerId = await currentUserId();
  if (!ownerId) return { status: "unauthenticated" };
  const referral = await readOwnReferral();
  if (referral.status !== "ready") return { status: "unavailable" };
  try {
    const admin = createSupabaseAdmin();
    let row = await rewardRow(admin, ownerId);
    if (row?.status === "paid") return { status: "paid", hash: row.transaction_hash };
    if (row?.status === "failed") return { status: "failed", hash: row.transaction_hash };
    if (row?.status === "submitted") return reconcileOrSubmit(admin, row);

    if (referral.progressStatus !== "ready") return { status: "unavailable" };
    if (referral.qualifiedCount < 10) return { status: "not_eligible" };
    if (referral.usdcTrustline !== true) return { status: "trustline_required" };

    const treasury = treasuryConfig();
    if (!treasury) return { status: "treasury_unconfigured" };
    if (!(await verifyTestnet())) return { status: "unavailable" };
    const wallet = await admin.from("wallets").select("public_key").eq("user_id", ownerId)
      .abortSignal(AbortSignal.timeout(4000)).maybeSingle();
    const destination = wallet.data?.public_key;
    if (wallet.error || typeof destination !== "string" || !StrKey.isValidEd25519PublicKey(destination)
      || destination === treasury.publicKey) return { status: "wallet_not_ready" };
    const recipient = await accountData(destination);
    if (!recipient || !hasUsdcTrustline(recipient)) return { status: "trustline_required" };

    if (!row) {
      const inserted = await admin.from(TABLE).insert({ owner_id: ownerId, status: "pending", network: "testnet",
        amount_stroops: REWARD_UNITS.toString(), qualified_invites: 10 })
        .select("owner_id,status,treasury_public_key,recipient_wallet,transaction_hash,transaction_xdr,lease_token,lease_until").maybeSingle();
      if (inserted.error && inserted.error.code !== "23505") return { status: "unavailable" };
      row = inserted.data as RewardRow | null ?? await rewardRow(admin, ownerId);
    }
    if (!row) return { status: "unavailable" };
    if (row.status === "paid") return { status: "paid", hash: row.transaction_hash };
    if (row.status === "failed") return { status: "failed", hash: row.transaction_hash };
    if (row.status === "submitted") return reconcileOrSubmit(admin, row);

    const now = Date.now();
    if (row.status === "preparing" && (!row.lease_until || Date.parse(row.lease_until) > now)) return { status: "pending" };
    const token = randomUUID();
    if (!(await acquireTreasuryLease(admin, token))) return { status: "busy" };
    const leaseUntil = new Date(now + CLAIM_LEASE_MS).toISOString();
    let claim = admin.from(TABLE).update({ status: "preparing", lease_token: token, lease_until: leaseUntil, updated_at: new Date(now).toISOString() })
      .eq("owner_id", ownerId);
    if (row.status === "pending") claim = claim.eq("status", "pending");
    else claim = claim.eq("status", "preparing").eq("lease_until", row.lease_until!);
    const claimed = await claim.select("owner_id,status,treasury_public_key,recipient_wallet,transaction_hash,transaction_xdr,lease_token,lease_until").maybeSingle();
    if (claimed.error || !claimed.data) {
      await releaseTreasuryLease(admin, token);
      return { status: "busy" };
    }

    const treasuryAccount = await accountData(treasury.publicKey).catch(() => null);
    if (!treasuryAccount || usdcUnits(treasuryAccount) === null || usdcUnits(treasuryAccount)! < REWARD_UNITS) {
      await updateReward(admin, ownerId, { status: "pending", lease_token: null, lease_until: null }, { status: "preparing", token });
      await releaseTreasuryLease(admin, token);
      return { status: "treasury_unfunded" };
    }

    let transaction: Transaction;
    try {
      transaction = new TransactionBuilder(new Account(treasury.publicKey, treasuryAccount.sequence), {
        fee: "100", networkPassphrase: Networks.TESTNET,
      }).addOperation(Operation.payment({ destination, asset: new Asset(USDC_CODE, USDC_ISSUER), amount: REWARD_AMOUNT }))
        .setTimeout(120).build();
    } catch {
      await updateReward(admin, ownerId, { status: "pending", lease_token: null, lease_until: null }, { status: "preparing", token });
      await releaseTreasuryLease(admin, token);
      return { status: "unavailable" };
    }
    transaction.sign(treasury.keypair);
    const hash = transaction.hash().toString("hex");
    const envelope = transaction.toXDR();
    const saved = await updateReward(admin, ownerId, { status: "submitted", treasury_public_key: treasury.publicKey,
      recipient_wallet: destination, transaction_hash: hash, transaction_xdr: envelope,
      lease_token: null, lease_until: null }, { status: "preparing", token });
    if (saved.error || !saved.data) {
      const current = await rewardRow(admin, ownerId).catch(() => null);
      if (!current || current.status !== "submitted" || current.transaction_hash !== hash) {
        await releaseTreasuryLease(admin, token);
        return { status: "busy" };
      }
      row = current;
    } else row = saved.data as RewardRow;

    return reconcileOrSubmit(admin, row, token);
  } catch { return { status: "unavailable" }; }
}
