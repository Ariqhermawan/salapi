export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
export const OWNER_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type UsernameStatus =
  | { status: "ready"; ownerId: string; address: string; handle: string }
  | { status: "required"; ownerId: string; address: string }
  | { status: "wallet_missing"; ownerId: string }
  | { status: "guest" | "unavailable" | "account_changed" };
export type UsernameSaveResult =
  | { ok: true; ownerId: string; handle: string }
  | { ok: false; code: "invalid" | "taken" | "unavailable" | "account_changed" | "wallet_missing" | "failed" }
  | { ok: false; code: "pending"; hash?: string };

export function normalizedUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/^@/, "").toLowerCase();
  return USERNAME_PATTERN.test(name) ? name : null;
}

/** Recovery and legal pages remain reachable without completing an account. */
export function usernameGateExempt(path: string): boolean {
  return ["/signin", "/terms", "/privacy", "/offline", "/wallet/setup"].includes(path)
    || path.startsWith("/auth/");
}
