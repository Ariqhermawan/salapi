import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { readActivityIdentities } from "./walletActivityIdentity";
import { attachActivityContexts, readActivityContextTitles } from "./walletActivityContext";
import { isWalletActivityCursor, normalizeWalletActivity, normalizeWalletActivityFee, WALLET_ACTIVITY_PAGE_SIZE, type WalletActivityItem, type WalletActivityPageResult, type WalletActivityResult } from "../wallet-activity";

const HORIZON_ACTIVITY = "https://horizon-testnet.stellar.org";
// Joined receipts contain XDR, so keep a bounded larger page envelope.
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_FEE_BUMP_READS = 8;
const unavailable = (address: string | null): Extract<WalletActivityPageResult, { ok: false }> => ({ ok: false, address, code: "unavailable", error: "Wallet history is unavailable. Try again." });
const sessionUnavailable = (ownerId: string | null = null): WalletActivityResult => ({ ...unavailable(null), ownerId });
const unauthenticated = (): WalletActivityResult => ({ ok: false, ownerId: null, address: null, code: "unauthenticated", error: "Sign in to load your wallet history." });

async function limitedJson(response: Response, maximumBytes = MAX_RESPONSE_BYTES): Promise<unknown> {
  if (!response.body) throw new Error("Missing history response");
  const reader = response.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, body = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maximumBytes) { await reader.cancel(); throw new Error("History response too large"); }
      body += decoder.decode(part.value, { stream: true });
    }
    body += decoder.decode();
    return JSON.parse(body);
  } finally { reader.releaseLock(); }
}

async function attachOuterFees(items: WalletActivityItem[], records: Record<string, unknown>[], address: string): Promise<WalletActivityItem[]> {
  const outerByInner = new Map<string, string>();
  for (const record of records) {
    const transaction = record.transaction as { hash?: unknown; fee_bump_transaction?: { hash?: unknown } } | undefined;
    const outer = transaction?.fee_bump_transaction?.hash;
    if (typeof record.transaction_hash === "string" && typeof outer === "string" && /^[a-f0-9]{64}$/i.test(outer) && outer.toLowerCase() !== transaction?.hash)
      outerByInner.set(record.transaction_hash.toLowerCase(), outer.toLowerCase());
  }
  const required = [...new Set(items.filter(item => item.fee.status === "unavailable").map(item => outerByInner.get(item.hash)).filter((hash): hash is string => !!hash))].slice(0, MAX_FEE_BUMP_READS);
  const receipts = new Map<string, unknown>();
  // Parallel independent reads, one shared deadline, fixed host, no _links.
  // Missing/limited fee reads never erase otherwise confirmed movements.
  const signal = AbortSignal.timeout(4_000);
  await Promise.all(required.map(async hash => {
    try {
      const response = await fetch(new URL(`/transactions/${hash}`, HORIZON_ACTIVITY), { method: "GET", cache: "no-store", redirect: "error", signal, headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const receipt = await limitedJson(response, 512_000) as { hash?: unknown };
      if (receipt?.hash === hash) receipts.set(hash, receipt);
    } catch { /* The row explicitly reports unavailable, never a zero fee. */ }
  }));
  return items.map(item => {
    const outer = outerByInner.get(item.hash);
    const fee = item.fee.status === "available" ? item.fee : normalizeWalletActivityFee(outer ? receipts.get(outer) : undefined, item.hash, address);
    return { ...item, fee: fee.status === "available" && StrKey.isValidEd25519PublicKey(fee.payer) ? fee : { status: "unavailable" } };
  });
}

/** Public on-chain reads only. Join fees with the page, never follow _links. */
export async function readWalletActivityPage(address: string, cursor: string | null = null): Promise<WalletActivityPageResult> {
  if (!StrKey.isValidEd25519PublicKey(address)) return { ok: false, address: null, code: "invalid-wallet", error: "Your saved wallet address is invalid." };
  if (cursor !== null && !isWalletActivityCursor(cursor)) return { ok: false, address, code: "invalid-cursor", error: "Invalid history page. Refresh your activity." };
  try {
    const url = new URL(`/accounts/${address}/payments`, HORIZON_ACTIVITY);
    url.searchParams.set("order", "desc");
    url.searchParams.set("limit", String(WALLET_ACTIVITY_PAGE_SIZE));
    url.searchParams.set("include_failed", "false");
    url.searchParams.set("join", "transactions");
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
    const items = attachActivityContexts(await attachOuterFees(normalizeWalletActivity(records, address), records, address), records, address);
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
    const page = await readWalletActivityPage(data.public_key, cursor as string | null ?? null);
    if (!page.ok) return { ...page, ownerId: userId };
    const [identities, items] = await Promise.all([
      readActivityIdentities(page.address, page.items).catch(() => []),
      readActivityContextTitles(page.items, page.address).catch(() => page.items),
    ]);
    return { ...page, items, ownerId: userId, identities };
  } catch { return sessionUnavailable(userId); }
}
