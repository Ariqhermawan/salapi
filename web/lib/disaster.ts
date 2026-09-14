import { StrKey } from "@stellar/stellar-sdk";
import { moneyInputToStroops, pesosToStroopsExact } from "./money.ts";

export type DisasterAction = ["Disburse", string, bigint] | ["Pause"] | ["Unpause"];
const MAX_AMOUNT = pesosToStroopsExact("1000000000")!;

export function parseDisasterAction(input: unknown): DisasterAction {
  if (!input || typeof input !== "object") throw new Error("Invalid proposal");
  const p = input as Record<string, unknown>;
  if (p.kind === "Pause" || p.kind === "Unpause") return [p.kind];
  if (p.kind !== "Disburse") throw new Error("Invalid proposal action");
  if (typeof p.recipient !== "string" || !StrKey.isValidEd25519PublicKey(p.recipient.trim()))
    throw new Error("Enter a valid Stellar recipient address (G…)");
  const amount = moneyInputToStroops(p.money);
  if (amount == null || amount <= 0n || amount > MAX_AMOUNT)
    throw new Error("Enter a valid positive amount");
  return ["Disburse", p.recipient.trim(), amount];
}

export function disasterProposalId(input: unknown, allowZero = false): bigint {
  if (typeof input !== "string" || !/^\d{1,20}$/.test(input)) throw new Error("Invalid proposal ID");
  const id = BigInt(input);
  if (id > 18_446_744_073_709_551_615n || (!allowZero && id === 0n)) throw new Error("Invalid proposal ID");
  return id;
}

export function requireDisasterMembership(publicKey: string, signers: string[], demo: boolean) {
  if (demo || !signers.includes(publicKey)) throw new Error("Only a configured signer can perform this action");
}

export function formatStroops(amount: string | bigint): string {
  const n = BigInt(amount);
  const fraction = (n % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${n / 10_000_000n}${fraction ? `.${fraction}` : ""}`;
}

export const DISASTER_ERRORS: Record<string, string> = {
  "4": "This wallet is not one of the three signers.",
  "7": "Proposal unavailable. Refresh and try again.",
  "8": "This wallet has already approved this proposal.",
  "9": "This proposal has already been executed.",
  "10": "Two different signer approvals are required.",
  "11": "The 20-ledger waiting period has not finished.",
  "12": "Payouts are paused. Two signers must authorize unpause first.",
  "13": "This payout exceeds the rolling 24-hour cap at the current vault balance.",
  "14": "The vault has insufficient funds.",
  "15": "This control proposal is stale. Create a new proposal.",
  "16": "The vault is already in that state.",
  "18": "Spending history is unavailable. Execution is blocked until it is restored.",
};

export function disasterError(message: string): string {
  const code = message.match(/Error\(Contract,\s*#(\d+)\)/)?.[1];
  return (code && DISASTER_ERRORS[code]) || "Transaction could not be confirmed. Refresh the proposal before retrying.";
}
