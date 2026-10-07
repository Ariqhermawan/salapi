/** Exact display formatting only. Keep this module free of ledger/SDK imports. */
export function formatStroops(amount: string | bigint): string {
  const n = BigInt(amount);
  const fraction = (n % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${n / 10_000_000n}${fraction ? `.${fraction}` : ""}`;
}
