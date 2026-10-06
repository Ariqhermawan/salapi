/** Public, confirmed native-XLM movements. No fiat amounts or balance guesses. */
export type WalletActivityItem = {
  id: string;
  hash: string;
  createdAt: string;
  direction: "sent" | "received";
  amountStroops: string;
  counterparty: string | null;
  kind: "payment" | "soroban-transfer" | "account-created" | "path-payment";
};

export type WalletActivityErrorCode = "unauthenticated" | "unavailable" | "invalid-cursor" | "invalid-wallet" | "local-preview";
/** Public provider output cannot establish a Supabase session identity. */
export type WalletActivityPageResult =
  | { ok: true; address: string; items: WalletActivityItem[]; nextCursor: string | null }
  | { ok: false; address: string | null; error: string; code: WalletActivityErrorCode };

/** Every session result identifies the verified owner, never the caller's hint. */
export type WalletActivityResult =
  | { ok: true; ownerId: string; address: string | null; items: WalletActivityItem[]; nextCursor: string | null }
  | { ok: false; ownerId: string | null; address: string | null; error: string; code: WalletActivityErrorCode };

export const WALLET_ACTIVITY_PAGE_SIZE = 30;
const MAX_CURSOR = 18_446_744_073_709_551_615n;

/** Cursors are data, never caller-supplied URLs or additional query strings. */
export function isWalletActivityCursor(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= MAX_CURSOR;
}

/** Horizon uses decimal XLM, including for native SAC balance-change events. */
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

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);
const publicAddress = (value: unknown): value is string => typeof value === "string" && /^[GC][A-Z2-7]{55}$/.test(value);

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
    function add(from: unknown, to: unknown, amount: unknown, kind: WalletActivityItem["kind"], suffix: string) {
      if (from !== address && to !== address) return;
      if (from === to) return;
      const amountStroops = activityXlmToStroops(amount);
      if (!amountStroops || !publicAddress(from) || !publicAddress(to)) throw new Error("Invalid native-XLM movement");
      const itemId = `${id}:${suffix}`;
      if (seen.has(itemId)) return;
      seen.add(itemId);
      const direction = from === address ? "sent" : "received";
      items.push({ id: itemId, hash: (hash as string).toLowerCase(), createdAt: createdAt as string, direction, amountStroops,
        counterparty: direction === "sent" ? to : from, kind });
    }
    if (raw.type === "payment" && raw.asset_type === "native") {
      add(raw.from, raw.to, raw.amount, "payment", "payment");
    } else if (raw.type === "create_account") {
      add(raw.funder, raw.account, raw.starting_balance, "account-created", "creation");
    } else if (raw.type === "invoke_host_function") {
      if (!Array.isArray(raw.asset_balance_changes)) throw new Error("Missing Stellar Asset Contract events");
      if (raw.asset_balance_changes.length > 100) throw new Error("Too many Stellar Asset Contract events");
      raw.asset_balance_changes.forEach((change, index) => {
        if (!object(change)) throw new Error("Invalid Stellar Asset Contract event");
        if (change.asset_type === "native" && change.type === "transfer") {
          add(change.from, change.to, change.amount, "soroban-transfer", `sac-${index}`);
        }
      });
    } else if (raw.type === "path_payment_strict_receive" || raw.type === "path_payment_strict_send") {
      // The source and destination assets/amounts can differ after a swap.
      if (raw.from === address && raw.source_asset_type === "native") add(raw.from, raw.to, raw.source_amount, "path-payment", "source");
      else if (raw.to === address && raw.asset_type === "native") add(raw.from, raw.to, raw.amount, "path-payment", "destination");
    }
  }
  return items;
}
