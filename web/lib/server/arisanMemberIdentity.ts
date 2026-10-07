import "server-only";
import { Account, BASE_FEE, Contract, Networks, rpc, scValToNative, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { isLocalPreview } from "@/lib/local-preview";
import type { ArisanMemberIdentityResult, ArisanRoomKind } from "@/lib/arisan-member-identity";
import { authenticatedArisanWallet } from "./arisanAuthorization";
import { readArisanWalletIdentities } from "./walletActivityIdentity";
import { arisanRoomsId, RPC_URL, sc } from "./stellar";

const MAX_MEMBERS = 20;
const TIMEOUT_MS = 4_000;
// Simulation source only. No private key or funded account is needed to read.
const READ_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
const failed = { ok: false } as const;

async function bounded<T>(read: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Room identity unavailable")), TIMEOUT_MS); })]);
  } finally { if (timer) clearTimeout(timer); }
}

function count(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "bigint") return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 && result <= MAX_MEMBERS ? result : null;
}

/** Public room ID is the only input. The authoritative contract supplies the
 * addresses, and a verified saved-wallet member gates private photo access.
 * This never accepts caller-selected wallet/owner IDs, provisions, or signs.
 */
export async function readArisanMemberIdentities(kind: ArisanRoomKind, roomId: number): Promise<ArisanMemberIdentityResult> {
  if (isLocalPreview || (kind !== "upfront" && kind !== "installments") || !Number.isSafeInteger(roomId) || roomId < 1 || roomId > 0xffff_ffff) return failed;
  const legacy = arisanRoomsId()?.trim();
  const contractId = kind === "upfront" ? legacy : process.env.ARISAN_INSTALLMENTS_CONTRACT?.trim();
  if (!contractId || !StrKey.isValidContract(contractId) || (kind === "installments" && contractId === legacy)) return failed;
  try {
    const server = new rpc.Server(RPC_URL, { timeout: TIMEOUT_MS });
    const read = async (method: string) => {
      const transaction = new TransactionBuilder(new Account(READ_SOURCE, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(contractId).call(method, sc.u32(roomId))).setTimeout(30).build();
      const simulation = await bounded(server.simulateTransaction(transaction));
      if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) throw Error("Room unavailable");
      return scValToNative(simulation.result.retval) as unknown;
    };
    const [rawRoom, rawMembers, owner] = await Promise.all([
      read("get_room"), read("get_members"), bounded(authenticatedArisanWallet()).catch(() => ({ ok: false } as const)),
    ]);
    if (!rawRoom || typeof rawRoom !== "object" || Array.isArray(rawRoom) || !Array.isArray(rawMembers)) return failed;
    const room = rawRoom as Record<string, unknown>;
    const memberTarget = count(room.member_target), memberCount = count(room.member_count);
    if (memberTarget === null || memberTarget < 3 || memberCount === null || memberCount > memberTarget || rawMembers.length !== memberCount) return failed;
    if (!rawMembers.every((address): address is string => typeof address === "string" && StrKey.isValidEd25519PublicKey(address)) || new Set(rawMembers).size !== memberCount) return failed;
    const allowPhotos = owner.ok && rawMembers.includes(owner.publicKey);
    const identities = await readArisanWalletIdentities(rawMembers, allowPhotos);
    return { ok: true, kind, roomId, identities };
  } catch { return failed; }
}
