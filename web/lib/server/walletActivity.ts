import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isWalletActivityCursor, normalizeWalletActivity, WALLET_ACTIVITY_PAGE_SIZE, type WalletActivityPageResult, type WalletActivityResult } from "../wallet-activity";

const HORIZON_ACTIVITY = "https://horizon-testnet.stellar.org";
const MAX_RESPONSE_BYTES = 512_000;
const unavailable = (address: string | null): Extract<WalletActivityPageResult, { ok: false }> => ({ ok: false, address, code: "unavailable", error: "Wallet history is unavailable. Try again." });
const sessionUnavailable = (ownerId: string | null = null): WalletActivityResult => ({ ...unavailable(null), ownerId });
const unauthenticated = (): WalletActivityResult => ({ ok: false, ownerId: null, address: null, code: "unauthenticated", error: "Sign in to load your wallet history." });

async function limitedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing history response");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, body = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error("History response too large"); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } finally { reader.releaseLock(); }
}

/** Public on-chain reads only, with one bounded request and no link following. */
export async function readWalletActivityPage(address: string, cursor: string | null = null): Promise<WalletActivityPageResult> {
  if (!StrKey.isValidEd25519PublicKey(address)) return { ok: false, address: null, code: "invalid-wallet", error: "Your saved wallet address is invalid." };
  if (cursor !== null && !isWalletActivityCursor(cursor)) return { ok: false, address, code: "invalid-cursor", error: "Invalid history page. Refresh your activity." };
  try {
    const url = new URL(`/accounts/${address}/payments`, HORIZON_ACTIVITY);
    url.searchParams.set("order", "desc");
    url.searchParams.set("limit", String(WALLET_ACTIVITY_PAGE_SIZE));
    url.searchParams.set("include_failed", "false");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { method: "GET", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000), headers: { Accept: "application/json" } });
    if (!response.ok) return unavailable(address);
    const result = await limitedJson(response) as { _embedded?: { records?: unknown } };
    const records = result?._embedded?.records;
    if (!Array.isArray(records) || records.length > WALLET_ACTIVITY_PAGE_SIZE) return unavailable(address);
    let previous = cursor ? BigInt(cursor) : null;
    for (const record of records) {
      if (!record || typeof record !== "object" || !isWalletActivityCursor(record.paging_token)) return unavailable(address);
      const current = BigInt(record.paging_token);
      if (previous !== null && current >= previous) return unavailable(address);
      previous = current;
    }
    const items = normalizeWalletActivity(records, address);
    const nextCursor = records.length === WALLET_ACTIVITY_PAGE_SIZE ? records.at(-1).paging_token as string : null;
    return { ok: true, address, items, nextCursor };
  } catch { return unavailable(address); }
}

/**
 * Resolve only this request's verified user and saved public wallet. Deliberately
 * do not reuse currentWalletPublicKey's error-to-null behavior: an auth/DB outage
 * must not masquerade as a successfully loaded empty transaction list.
 */
export async function currentWalletActivity(cursor: unknown = null): Promise<WalletActivityResult> {
  if (isLocalPreview) return { ok: false, ownerId: null, address: null, code: "local-preview", error: "Local preview cannot load actual wallet history." };
  if (cursor !== null && cursor !== undefined && !isWalletActivityCursor(cursor)) return { ok: false, ownerId: null, address: null, code: "invalid-cursor", error: "Invalid history page. Refresh your activity." };
  if (!supabaseConfigured()) return unauthenticated();
  let supabase: Awaited<ReturnType<typeof createSupabaseServer>>;
  // Constructing the client is not proof of a guest, even if setup happens to
  // throw a session-shaped error. Only the actual auth read can establish that.
  try { supabase = await createSupabaseServer(); }
  catch { return sessionUnavailable(); }
  let userId: string;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return user === null && isAuthSessionMissingError(error) ? unauthenticated() : sessionUnavailable();
    if (user === null) return unauthenticated();
    if (typeof user?.id !== "string" || !user.id) return sessionUnavailable();
    userId = user.id;
  } catch (error) { return isAuthSessionMissingError(error) ? unauthenticated() : sessionUnavailable(); }
  if (!supabaseAdminConfigured()) return sessionUnavailable(userId);
  try {
    const { data, error } = await createSupabaseAdmin().from("wallets").select("public_key").eq("user_id", userId).maybeSingle();
    if (error) return sessionUnavailable(userId);
    if (data === null) return { ok: true, ownerId: userId, address: null, items: [], nextCursor: null };
    if (typeof data?.public_key !== "string" || !StrKey.isValidEd25519PublicKey(data.public_key)) return { ok: false, ownerId: userId, address: null, code: "invalid-wallet", error: "Your saved wallet address is invalid." };
    return { ...await readWalletActivityPage(data.public_key, cursor as string | null ?? null), ownerId: userId };
  } catch { return sessionUnavailable(userId); }
}
