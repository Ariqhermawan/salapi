import "server-only";
import { Account, Address, BASE_FEE, Contract, nativeToScVal, Networks, rpc, scValToNative, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/env";
import { ACCOUNT_AVATAR_BUCKET, ACCOUNT_AVATAR_METADATA_KEY, googleAccountPhoto, ownedAccountPhotoPath } from "@/lib/account-photo";
import { CONTRACTS, RPC_URL } from "./stellar";
import type { WalletActivityIdentity, WalletActivityItem } from "../wallet-activity";

const MAX_IDENTITIES = 12;
const WORKERS = 3;
const DEADLINE_MS = 4_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validAddress = (value: string | null): value is string => typeof value === "string" && StrKey.isValidEd25519PublicKey(value);

async function beforeDeadline<T>(promise: PromiseLike<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw Error("Identity deadline");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(promise), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Identity deadline")), remaining); })]);
  } finally { if (timer) clearTimeout(timer); }
}

/** Read-only simulation: no private key, signing, submission or provisioning. */
async function publicHandle(address: string, deadline: number): Promise<string | null> {
  try {
    const server = new rpc.Server(RPC_URL, { timeout: Math.max(1, deadline - Date.now()) });
    const call = async (method: string, argument: ReturnType<Address["toScVal"]>) => {
      const transaction = new TransactionBuilder(new Account(address, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(CONTRACTS.usernameRegistry).call(method, argument)).setTimeout(30).build();
      const response = await beforeDeadline(server.simulateTransaction(transaction), deadline);
      if (!rpc.Api.isSimulationSuccess(response) || !response.result) throw Error("Registry unavailable");
      return scValToNative(response.result.retval);
    };
    const handle: unknown = await call("username_of", new Address(address).toScVal());
    if (typeof handle !== "string" || !/^[a-z0-9_]{3,32}$/.test(handle)) return null;
    // Never trust a nickname or a stale reverse mapping as address ownership.
    return await call("resolve", nativeToScVal(handle, { type: "string" })) === address ? handle : null;
  } catch { return null; }
}

function safeSignedPhoto(value: unknown, path: string): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const url = new URL(value), configured = new URL(SUPABASE_URL);
    return url.protocol === "https:" && !url.username && !url.password && url.origin === configured.origin
      && url.pathname === `/storage/v1/object/sign/${ACCOUNT_AVATAR_BUCKET}/${path}` ? url.href : null;
  } catch { return null; }
}

/** Called only after verified auth + saved-wallet lookup + confirmed Horizon
 * normalization. No caller-selected address or arbitrary profile endpoint.
 * Optional identity failure cannot hide a confirmed financial movement.
 */
export async function readActivityIdentities(viewer: string, items: WalletActivityItem[]): Promise<WalletActivityIdentity[]> {
  if (!validAddress(viewer)) return [];
  const addresses = [...new Set([viewer, ...items.flatMap(item => [item.counterparty, item.fee.status === "available" ? item.fee.payer : null])].filter(validAddress))].slice(0, MAX_IDENTITIES);
  const result = addresses.map(address => ({ address, handle: null, photoUrl: null } as WalletActivityIdentity));
  const deadline = Date.now() + DEADLINE_MS;
  const owners = new Map<string, string>();
  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
    const { data, error } = await beforeDeadline(admin.from("wallets").select("public_key,user_id").in("public_key", addresses)
      .limit(MAX_IDENTITIES + 1).abortSignal(AbortSignal.timeout(DEADLINE_MS)), deadline);
    if (!error && Array.isArray(data) && data.length <= MAX_IDENTITIES) {
      const duplicates = new Set<string>();
      for (const row of data) {
        if (!addresses.includes(row.public_key) || typeof row.user_id !== "string" || !UUID.test(row.user_id)) continue;
        if (owners.has(row.public_key)) duplicates.add(row.public_key);
        owners.set(row.public_key, row.user_id);
      }
      for (const duplicate of duplicates) owners.delete(duplicate);
    }
  } catch { return result; }
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(WORKERS, addresses.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= result.length || Date.now() >= deadline) return;
      const identity = result[index];
      identity.handle = await publicHandle(identity.address, deadline);
      const ownerId = owners.get(identity.address);
      if (!ownerId || Date.now() >= deadline) continue;
      try {
        // Bounded, confirmed receipt participants only. Never list auth users.
        const { data, error } = await beforeDeadline(admin.auth.admin.getUserById(ownerId), deadline);
        const user = data.user;
        if (error || !user || user.id !== ownerId || user.user_metadata?.salapi_receipt_photo_consent !== true) continue;
        const path = ownedAccountPhotoPath(user.user_metadata[ACCOUNT_AVATAR_METADATA_KEY], ownerId);
        if (path) {
          const signed = await beforeDeadline(admin.storage.from(ACCOUNT_AVATAR_BUCKET).createSignedUrl(path, 300), deadline);
          if (!signed.error) identity.photoUrl = safeSignedPhoto(signed.data?.signedUrl, path);
        }
        identity.photoUrl ??= googleAccountPhoto(user);
      } catch { /* No consent/readable photo means initials, never a fake face. */ }
    }
  }));
  return result;
}
