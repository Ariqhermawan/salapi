import type { WalletActivityResult } from "@/lib/wallet-activity";

/** Private display GETs must not queue behind financial Server Actions. */
export async function readWalletActivity(cursor: string | null, signal: AbortSignal): Promise<WalletActivityResult> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const response = await fetch(`/api/account/activity${query}`, {
    credentials: "same-origin", cache: "no-store", redirect: "error", signal,
  });
  if (!response.ok) throw Error("Activity unavailable");
  const result = await response.json();
  if (!result || typeof result !== "object" || typeof result.ok !== "boolean"
    || (result.ok && (typeof result.ownerId !== "string" || !Array.isArray(result.items) || result.items.length > 30))
    || (!result.ok && typeof result.code !== "string")) throw Error("Invalid activity response");
  return result;
}
