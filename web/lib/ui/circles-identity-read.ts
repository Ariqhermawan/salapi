import type { CirclesSignupIdentity } from "@/lib/circles/signup";

/** A private display read. Never queued with signing or subscription actions. */
export async function readCirclesSignupIdentityClient(): Promise<CirclesSignupIdentity> {
  const response = await fetch("/api/account/circles-identity", {
    method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20_000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Account identity is unavailable.");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Account identity is unavailable.");
  const value = result as Record<string, unknown>;
  if (value.status === "guest" || value.status === "unavailable" || value.status === "unverified") return { status: value.status };
  if (value.status !== "verified" || typeof value.ownerId !== "string" || !value.ownerId || value.ownerId.length > 120
    || typeof value.email !== "string" || value.email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)
    || (value.source !== "google" && value.source !== "account")) throw new Error("Account identity is unavailable.");
  // Project only the existing verified identity contract, never SDK claims or
  // additional profile fields. The hook still rejects mismatched auth owners.
  return { status: "verified", ownerId: value.ownerId, email: value.email, source: value.source };
}
