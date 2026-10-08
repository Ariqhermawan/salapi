/** Normalize optional @/case only. Never silently delete a mistyped character. */
export function recipientUsername(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

export const RECIPIENT_USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

/** Only the username registry's specific NotFound is evidence of absence. */
export function recipientLookupFailure(error: unknown): "not_found" | "unavailable" {
  return error instanceof Error && /Error\(Contract, #3\)/.test(error.message) ? "not_found" : "unavailable";
}

/** A reviewed username must still resolve to the same wallet at confirmation. */
export function recipientReviewError(resolved: string, expected?: string): string | null {
  if (expected !== undefined && expected !== resolved) return "This username now resolves to a different wallet. Review the recipient again before sending.";
  return null;
}
