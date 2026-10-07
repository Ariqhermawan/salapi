/** Fixed server policy for the isolated Testnet installment candidate only.
 * It is not a quote or a statement about Mainnet economics. */
export const MAX_FUNDING_FEE_STROOPS = "50000000";
export const MAX_FUNDING_FEE_XLM = "5";
export const MIN_FUNDING_RESOURCE_BUFFER_STROOPS = "1000000";
export const FUNDING_FEE_LIMIT_ERROR = "The network fee exceeds the 5 Testnet XLM transaction limit. Nothing was signed or submitted.";
export const FUNDING_INVOKE_OPTIONS = Object.freeze({
  maxFeeStroops: MAX_FUNDING_FEE_STROOPS,
  bufferRefundableResourceFee: true,
});

/** Canonical positive integer, within the classic transaction uint32 field. */
export function validTransactionFee(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value)
    && BigInt(value) <= 0xffff_ffffn;
}

export function transactionFeeWithinCap(fee: unknown, cap: unknown): boolean {
  return validTransactionFee(fee) && validTransactionFee(cap) && BigInt(fee) <= BigInt(cap);
}

/** Round up the 10% margin. This is a refundable resource allowance, not an
 * extra contribution. Final inclusion + resource fee still needs its cap. */
export function bufferedFundingResourceFee(value: unknown): string | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,9})$/.test(value)
    || BigInt(value) > 0xffff_ffffn) return null;
  const original = BigInt(value);
  const tenPercent = (original + 9n) / 10n;
  const minimum = BigInt(MIN_FUNDING_RESOURCE_BUFFER_STROOPS);
  const buffered = original + (tenPercent > minimum ? tenPercent : minimum);
  return buffered <= 0xffff_ffffn ? buffered.toString() : null;
}
