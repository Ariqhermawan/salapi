/** A reviewed username must still resolve to the same wallet at confirmation. */
export function recipientReviewError(resolved: string, expected?: string): string | null {
  if (expected !== undefined && expected !== resolved) return "This username now resolves to a different wallet. Review the recipient again before sending.";
  return null;
}
