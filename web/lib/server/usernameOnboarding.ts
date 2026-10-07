import "server-only";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { isLocalPreview } from "@/lib/local-preview";
import { CONTRACTS, readContract, invokeAs, sc } from "@/lib/server/stellar";
import { getAuthenticatedSigner } from "@/lib/server/userWallet";
import { OWNER_PATTERN, USERNAME_PATTERN, normalizedUsername, type UsernameStatus, type UsernameSaveResult } from "@/lib/username-onboarding";

/** Read only. Never create/fund a wallet, decrypt keys, or trust user metadata. */
export async function readUsernameStatus(expectedOwner: unknown): Promise<UsernameStatus> {
  if (typeof expectedOwner !== "string" || !OWNER_PATTERN.test(expectedOwner)
    || isLocalPreview || !supabaseConfigured()) return { status: "unavailable" };
  try {
    const { data, error } = await (await createSupabaseServer()).auth.getUser();
    if (error) return { status: data.user === null && isAuthSessionMissingError(error) ? "guest" : "unavailable" };
    const user = data.user;
    if (user === null || user?.is_anonymous === true) return { status: "guest" };
    if (!user || user.is_anonymous !== false || !OWNER_PATTERN.test(user.id)) return { status: "unavailable" };
    if (user.id !== expectedOwner) return { status: "account_changed" };
    if (!supabaseAdminConfigured()) return { status: "unavailable" };
    const { data: wallet, error: walletError } = await createSupabaseAdmin().from("wallets")
      .select("public_key").eq("user_id", user.id).maybeSingle();
    if (walletError) return { status: "unavailable" };
    if (wallet === null) return { status: "wallet_missing", ownerId: user.id };
    if (typeof wallet.public_key !== "string" || !StrKey.isValidEd25519PublicKey(wallet.public_key)) return { status: "unavailable" };
    try {
      const handle = await readContract(CONTRACTS.usernameRegistry, "username_of", [sc.addr(wallet.public_key)]);
      return typeof handle === "string" && USERNAME_PATTERN.test(handle)
        ? { status: "ready", ownerId: user.id, address: wallet.public_key, handle }
        : { status: "unavailable" };
    } catch (error) {
      // Only the registry's NotFound proves a username is absent.
      return error instanceof Error && /Error\(Contract, #3\)/.test(error.message)
        ? { status: "required", ownerId: user.id, address: wallet.public_key }
        : { status: "unavailable" };
    }
  } catch (error) {
    return { status: isAuthSessionMissingError(error) ? "guest" : "unavailable" };
  }
}

/** Explicit claim, bound to the reviewed Auth owner and their canonical wallet. */
export async function saveOnboardingUsername(expectedOwner: unknown, input: unknown): Promise<UsernameSaveResult> {
  const name = normalizedUsername(input);
  if (!name) return { ok: false, code: "invalid" };
  const before = await readUsernameStatus(expectedOwner);
  if (before.status === "ready") return { ok: true, ownerId: before.ownerId, handle: before.handle };
  if (before.status !== "required") return { ok: false, code: before.status === "wallet_missing" ? "wallet_missing" : before.status === "account_changed" ? "account_changed" : "unavailable" };
  let signer: Awaited<ReturnType<typeof getAuthenticatedSigner>>;
  try { signer = await getAuthenticatedSigner(); }
  catch { return { ok: false, code: "unavailable" }; }
  if (signer.demo || signer.publicKey !== before.address) return { ok: false, code: "account_changed" };
  try {
    const result = await invokeAs(signer.secret, CONTRACTS.usernameRegistry, "register", [sc.addr(signer.publicKey), sc.str(name)]);
    if (!result.ok) {
      if (result.pending) return { ok: false, code: "pending", hash: result.hash };
      if (/Error\(Contract, #1\)/.test(result.error)) return { ok: false, code: "taken" };
      if (!/Error\(Contract, #2\)/.test(result.error)) return { ok: false, code: "failed" };
    }
    // Success or a concurrent AlreadyRegistered: confirm the canonical name,
    // never accept the submitted string as completion evidence.
    const after = await readUsernameStatus(expectedOwner);
    if (after.status === "ready") return { ok: true, ownerId: after.ownerId, handle: after.handle };
    return { ok: false, code: "pending", ...(result.ok ? { hash: result.hash } : {}) };
  } catch { return { ok: false, code: "pending" }; }
}
