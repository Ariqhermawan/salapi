// Server-only Testnet account readiness. This never signs a transaction or
// replaces a saved wallet. A provider outage is not a zero balance or a 404.
import { StrKey } from "@stellar/stellar-sdk";
import { nativeBalanceToStroops } from "@/lib/money";

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const FRIENDBOT_TESTNET = "https://friendbot.stellar.org";
const REQUEST_TIMEOUT_MS = 4_000;

export class WalletAccountMissingError extends Error {
  constructor() {
    super("Your saved wallet is not yet active on Stellar Testnet. Retry wallet setup.");
    this.name = "WalletAccountMissingError";
  }
}

function validAddress(address: string) {
  if (typeof address !== "string" || !StrKey.isValidEd25519PublicKey(address))
    throw new Error("Your saved wallet address is invalid. No transaction was submitted.");
}

/** One fixed-host request, including its body, has a finite deadline. */
async function accountBalance(address: string): Promise<bigint | null> {
  validAddress(address);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${HORIZON_TESTNET}/accounts/${address}`, {
      cache: "no-store", redirect: "error", signal: controller.signal,
    });
    // Only an explicit not-found response authorizes account-creation funding.
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Horizon request failed");
    const raw: unknown = await response.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid account response");
    const account = raw as { account_id?: unknown; balances?: unknown };
    if (account.account_id !== address || !Array.isArray(account.balances)) throw new Error("Invalid account identity");
    const native = account.balances.filter(value => value && typeof value === "object" && value.asset_type === "native");
    if (native.length !== 1 || typeof native[0].balance !== "string" ||
      !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,7})?$/.test(native[0].balance)) throw new Error("Invalid native balance");
    const amount = nativeBalanceToStroops(native[0].balance);
    if (amount === null || amount > 9_223_372_036_854_775_807n) throw new Error("Invalid native amount");
    return amount;
  } catch {
    throw new Error("Your Testnet wallet balance is unavailable. Retry when Horizon is reachable.");
  } finally {
    clearTimeout(timer);
  }
}

/** Actual native balance only. Missing and unavailable are never fabricated 0. */
export async function getTestnetNativeBalance(address: string): Promise<bigint> {
  const balance = await accountBalance(address);
  if (balance === null) throw new WalletAccountMissingError();
  return balance;
}

/**
 * At most three bounded requests: Horizon, optional Friendbot, then Horizon.
 * Existing accounts (including zero/low balances) never trigger the faucet.
 * A rejected/lost faucet response is reconciled against the SAME address: a
 * concurrent successful setup may already have activated the canonical key.
 */
export async function ensureTestnetAccount(address: string): Promise<bigint> {
  const current = await accountBalance(address);
  if (current !== null) return current;

  let faucetAccepted = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${FRIENDBOT_TESTNET}/?addr=${encodeURIComponent(address)}`, {
      cache: "no-store", redirect: "error", signal: controller.signal,
    });
    faucetAccepted = response.ok;
    // The body is not evidence of account readiness. Horizon is authoritative.
    await response.body?.cancel();
  } catch {
    // A lost response does not establish whether Friendbot created the account.
  } finally {
    clearTimeout(timer);
  }

  const confirmed = await accountBalance(address);
  if (confirmed !== null) return confirmed;
  throw new Error(faucetAccepted
    ? "Testnet funding is not confirmed yet. Your wallet address is saved. Retry wallet setup."
    : "Testnet funding could not be confirmed. Your wallet address is saved. Retry wallet setup.");
}
