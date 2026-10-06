/** Browser-only rehearsal. Never a payment request, ledger entry or KYC grant. */
export type DemoPaymentStatus = "entry" | "review" | "pending" | "succeeded" | "failed" | "expired" | "reversed";
export type DemoPaymentEvent = "review" | "edit" | "confirm" | "succeeded" | "failed" | "expired" | "reversed" | "reset";
export function nextDemoPaymentStatus(status: DemoPaymentStatus, event: DemoPaymentEvent, preview: boolean, payout: boolean): DemoPaymentStatus {
  if (!preview) return status;
  if (event === "reset") return "entry";
  if (event === "review" && status === "entry") return "review";
  if (event === "edit" && status === "review") return "entry";
  if (event === "confirm" && status === "review") return "pending";
  if ((event === "succeeded" || event === "failed" || event === "expired") && status === "pending") return event === "expired" && payout ? status : event;
  if (event === "reversed" && payout && status === "succeeded") return "reversed";
  return status;
}

export function demoAmountMinor(raw: string, dp: number): bigint | null {
  if (![0,2].includes(dp) || !/^\d+(?:\.\d+)?$/.test(raw) || raw.length>24) return null;
  const [whole,fraction=""]=raw.split(".");
  if(fraction.length>dp)return null;
  const value=BigInt(whole)*(10n**BigInt(dp))+BigInt(fraction.padEnd(dp,"0") || "0");
  return value>0n && value<=1_000_000_000_000_000n ? value : null;
}
