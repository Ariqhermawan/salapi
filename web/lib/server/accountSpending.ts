import "server-only";
import { availableBalanceFromHorizon } from "@/lib/available-balance";
import { readAccountWallet } from "./accountWallet";

export async function readAccountSpending() {
  const owner = await readAccountWallet();
  if (!owner.ok) return owner;
  try {
    const read = async (path: string) => {
      const response = await fetch(`https://horizon-testnet.stellar.org/${path}`, {
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4_000),
      });
      if (!response.ok) throw Error("Balance unavailable");
      return response.json();
    };
    const [account, ledgers] = await Promise.all([read(`accounts/${owner.address}`), read("ledgers?order=desc&limit=1")]);
    const balance = availableBalanceFromHorizon(account, ledgers?._embedded?.records?.[0], owner.address);
    if (!balance) throw Error("Invalid balance");
    return { ok: true as const, ownerId: owner.ownerId, balance };
  } catch { return { ok: false as const, ownerId: owner.ownerId, code: "unavailable" }; }
}
