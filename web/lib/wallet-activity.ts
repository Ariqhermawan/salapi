import type { MarketPriceResult } from "./market-prices";

/** Network-specific identities, verified against Circle's issuer documentation.
 * The SAC is Asset("USDC", issuer).contractId(Networks.TESTNET), not a code-only
 * token match. This history allowlist does not change the app's transfer rail.
 */
export const USDC_TESTNET_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USDC_TESTNET_SAC = "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";
export type WalletActivityAsset = { code: "XLM" | "USDC"; issuer: string | null; contractId: string | null; decimals: 7; network: "testnet" };
export const XLM_ACTIVITY_ASSET: WalletActivityAsset = { code: "XLM", issuer: null, contractId: null, decimals: 7, network: "testnet" };
export const USDC_ACTIVITY_ASSET: WalletActivityAsset = { code: "USDC", issuer: USDC_TESTNET_ISSUER, contractId: USDC_TESTNET_SAC, decimals: 7, network: "testnet" };
export type WalletActivityFee =
  | { status: "unavailable" }
  | { status: "available"; amountStroops: string; payer: string; paidByWallet: boolean; transactionHash: string; feeBump: boolean };

/** Public, confirmed allowlisted asset movements. No fiat or balance guesses. */
export type WalletActivityItem = {
  id: string;
  hash: string;
  createdAt: string;
  direction: "sent" | "received";
  amountStroops: string;
  asset: WalletActivityAsset;
  fee: WalletActivityFee;
  counterparty: string | null;
  kind: "payment" | "soroban-transfer" | "account-created" | "path-payment";
};

export type WalletActivityErrorCode = "unauthenticated" | "unavailable" | "invalid-cursor" | "invalid-wallet" | "local-preview";
/** Only verified public handles and explicitly consented receipt photos. */
export type WalletActivityIdentity = { address: string; handle: string | null; photoUrl: string | null };
/** Public provider output cannot establish a Supabase session identity. */
export type WalletActivityPageResult =
  | { ok: true; address: string; items: WalletActivityItem[]; nextCursor: string | null }
  | { ok: false; address: string | null; error: string; code: WalletActivityErrorCode };

/** Every session result identifies the verified owner, never the caller's hint. */
export type WalletActivityResult =
  | { ok: true; ownerId: string; address: string | null; items: WalletActivityItem[]; nextCursor: string | null; identities?: WalletActivityIdentity[] }
  | { ok: false; ownerId: string | null; address: string | null; error: string; code: WalletActivityErrorCode };

export const WALLET_ACTIVITY_PAGE_SIZE = 30;
const MAX_CURSOR = 18_446_744_073_709_551_615n;

/** Cursors are data, never caller-supplied URLs or additional query strings. */
export function isWalletActivityCursor(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= MAX_CURSOR;
}

/** Horizon uses seven decimals for Stellar classic assets and SAC events. */
export function activityXlmToStroops(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,31})(?:\.\d{1,7})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
  return amount > 0n ? amount.toString() : null;
}

/** Exact token display; retain even one stroop without floating-point rounding. */
export function activityStroopsToXlm(value: string): string {
  if (!/^\d{1,40}$/.test(value)) return "0";
  const amount = BigInt(value), whole = amount / 10_000_000n;
  const fraction = (amount % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Display-only current XLM/USDC equivalent. Never used to send/convert tokens.
 * Recheck the shared quote's age here so an open receipt cannot retain a price
 * forever. A USDC movement stays actual USDC and needs no synthetic equivalent.
 */
export function activityUsdcEquivalent(amountStroops: string, asset: WalletActivityAsset, quote: MarketPriceResult, nowMs = Date.now()): { amount: number; status: "fresh" | "stale"; updatedAt: number } | null {
  if (asset.code !== "XLM" || (quote.status !== "fresh" && quote.status !== "stale") || quote.source !== "CoinGecko"
    || !/^(?:0|[1-9]\d{0,39})$/.test(amountStroops) || !Number.isFinite(nowMs)) return null;
  const timestamps = [quote.fetchedAt, quote.assets?.xlm?.updatedAt, quote.assets?.usdc?.updatedAt];
  if (timestamps.some(value => !Number.isSafeInteger(value) || value <= 0 || value * 1000 > nowMs + 60_000)) return null;
  const updatedAt = Math.min(...timestamps), age = Math.max(0, nowMs - updatedAt * 1000);
  if (age > 300_000) return null;
  const xlmPrice = quote.assets.xlm.prices?.usd, usdcPrice = quote.assets.usdc.prices?.usd;
  if (![xlmPrice, usdcPrice].every(value => Number.isFinite(value) && value > 0)) return null;
  const units = BigInt(amountStroops);
  const native = Number(units / 10_000_000n) + Number(units % 10_000_000n) / 10_000_000;
  const amount = native * xlmPrice / usdcPrice;
  return Number.isFinite(amount) ? { amount, updatedAt, status: quote.status === "stale" || age > 120_000 ? "stale" : "fresh" } : null;
}

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const publicAddress = (value: unknown): value is string => typeof value === "string" && /^[GC][A-Z2-7]{55}$/.test(value);
const transactionHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);

function assetOf(raw: RecordValue, prefix = ""): WalletActivityAsset | null {
  if (raw[`${prefix}asset_type`] === "native") return XLM_ACTIVITY_ASSET;
  const code = raw[`${prefix}asset_code`], issuer = raw[`${prefix}asset_issuer`];
  if (raw[`${prefix}asset_type`] === "credit_alphanum4" && code === "USDC" && issuer === USDC_TESTNET_ISSUER) {
    if (!prefix && raw.contract_id !== undefined && raw.contract_id !== USDC_TESTNET_SAC) return null;
    return USDC_ACTIVITY_ASSET;
  }
  // A verified SAC is sufficient only when no contradictory classic identity
  // is supplied. An arbitrary contract or spoofed USDC issuer is never USDC.
  if (!prefix && raw.contract_id === USDC_TESTNET_SAC && code === undefined && issuer === undefined) return USDC_ACTIVITY_ASSET;
  return null;
}

/** Horizon fee_charged is the finalized transaction fee, including Soroban
 * resource fees/refunds. Never add resource_fee or sum inner + fee-bump fees.
 * A fee belongs to a transaction, not each operation or balance-change event.
 */
export function normalizeWalletActivityFee(raw: unknown, expectedHash: string, address: string): WalletActivityFee {
  const unavailable: WalletActivityFee = { status: "unavailable" };
  if (!object(raw) || raw.successful !== true || !transactionHash(raw.hash) || !transactionHash(expectedHash)) return unavailable;
  if (raw.inner_transaction !== undefined && (!object(raw.inner_transaction) || !transactionHash(raw.inner_transaction.hash))) return unavailable;
  if (raw.fee_bump_transaction !== undefined && (!object(raw.fee_bump_transaction) || !transactionHash(raw.fee_bump_transaction.hash))) return unavailable;
  const inner = object(raw.inner_transaction) && transactionHash(raw.inner_transaction.hash) ? raw.inner_transaction.hash.toLowerCase() : null;
  if (raw.hash.toLowerCase() !== expectedHash.toLowerCase() && inner !== expectedHash.toLowerCase()) return unavailable;
  const bump = object(raw.fee_bump_transaction) && transactionHash(raw.fee_bump_transaction.hash) ? raw.fee_bump_transaction.hash.toLowerCase() : null;
  // The inner lookup can report zero: that is not evidence of a free transfer.
  // Read the outer receipt instead before assigning a sponsored fee.
  if (bump && bump !== raw.hash.toLowerCase()) return unavailable;
  const charged = typeof raw.fee_charged === "number" && Number.isSafeInteger(raw.fee_charged) ? String(raw.fee_charged) : raw.fee_charged;
  if (typeof charged !== "string" || !/^(?:0|[1-9]\d{0,18})$/.test(charged) || BigInt(charged) > 9_223_372_036_854_775_807n ||
      typeof raw.fee_account !== "string" || !/^G[A-Z2-7]{55}$/.test(raw.fee_account)) return unavailable;
  return { status: "available", amountStroops: charged, payer: raw.fee_account, paidByWallet: raw.fee_account === address,
    transactionHash: raw.hash.toLowerCase(), feeBump: Boolean(bump || inner) };
}

/**
 * Normalize the account payments feed, which includes classic payments and
 * invoke_host_function SAC transfers. Use proven from/to events, never infer a
 * recipient from source_account, XDR arguments, or a before/after balance.
 */
export function normalizeWalletActivity(records: unknown, address: string): WalletActivityItem[] {
  if (!Array.isArray(records) || records.length > WALLET_ACTIVITY_PAGE_SIZE || !publicAddress(address)) throw new Error("Invalid wallet activity data");
  const items: WalletActivityItem[] = [];
  const seen = new Set<string>();
  for (const raw of records) {
    if (!object(raw)) throw new Error("Invalid wallet activity record");
    // Failed operations never moved the amounts requested in their arguments.
    if (raw.transaction_successful === false) continue;
    if (raw.transaction_successful !== true) throw new Error("Unconfirmed wallet activity record");
    const { id, transaction_hash: hash, created_at: createdAt } = raw;
    if (!isWalletActivityCursor(id) || typeof hash !== "string" || !/^[a-f0-9]{64}$/i.test(hash) ||
        typeof createdAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(createdAt) || !Number.isFinite(Date.parse(createdAt))) {
      throw new Error("Invalid wallet activity receipt");
    }
    const fee = normalizeWalletActivityFee(raw.transaction, hash as string, address);
    function add(from: unknown, to: unknown, amount: unknown, kind: WalletActivityItem["kind"], suffix: string, asset: WalletActivityAsset, selfSwap = false) {
      if (from !== address && to !== address) return;
      if (from === to && !selfSwap) return;
      const amountStroops = activityXlmToStroops(amount);
      if (!amountStroops || !publicAddress(from) || !publicAddress(to)) throw new Error("Invalid native-XLM movement");
      const itemId = `${id}:${suffix}`;
      if (seen.has(itemId)) return;
      seen.add(itemId);
      const direction = selfSwap && suffix === "destination" ? "received" : from === address ? "sent" : "received";
      items.push({ id: itemId, hash: (hash as string).toLowerCase(), createdAt: createdAt as string, direction, amountStroops,
        counterparty: direction === "sent" ? to : from, kind, asset, fee });
    }
    if (raw.type === "payment") {
      const asset = assetOf(raw);
      if (asset) add(raw.from, raw.to, raw.amount, "payment", "payment", asset);
    } else if (raw.type === "create_account") {
      add(raw.funder, raw.account, raw.starting_balance, "account-created", "creation", XLM_ACTIVITY_ASSET);
    } else if (raw.type === "invoke_host_function") {
      if (!Array.isArray(raw.asset_balance_changes)) throw new Error("Missing Stellar Asset Contract events");
      if (raw.asset_balance_changes.length > 100) throw new Error("Too many Stellar Asset Contract events");
      raw.asset_balance_changes.forEach((change, index) => {
        if (!object(change)) throw new Error("Invalid Stellar Asset Contract event");
        const asset = assetOf(change);
        if (asset && change.type === "transfer") {
          add(change.from, change.to, change.amount, "soroban-transfer", `sac-${index}`, asset);
        }
      });
    } else if (raw.type === "path_payment_strict_receive" || raw.type === "path_payment_strict_send") {
      // The source and destination assets/amounts can differ after a swap.
      const source = assetOf(raw, "source_"), destination = assetOf(raw);
      const selfSwap = raw.from === address && raw.to === address && source?.code !== destination?.code;
      if (raw.from === address && source) add(raw.from, raw.to, raw.source_amount, "path-payment", "source", source, selfSwap);
      if (raw.to === address && destination) add(raw.from, raw.to, raw.amount, "path-payment", "destination", destination, selfSwap);
    }
  }
  return items;
}
