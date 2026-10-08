import "server-only";
import { StrKey } from "@stellar/stellar-sdk";
import type { Campaign } from "@/lib/campaign";
import { isLocalPreview } from "@/lib/local-preview";
import { readAccountWallet } from "./accountWallet";
import { CONTRACTS, donationCampaignId, readContract, sc } from "./stellar";
import { readCircleDiscoveryMappings, circleDiscoveryLinks } from "./circlesTestnet";

export type VaultCampaignHistory =
  | { ok: false; error: string }
  | { ok: true; ownerId: string; viewer: string; contractId: string; now: string;
      campaigns: Campaign[]; nextCursor: string | null; complete: boolean; circleLinks?: Record<string, string> };

const PAGE_SIZE = 20;
const MAX_PAGES = 4;
const READ_DEADLINE_MS = 12_000;
const MAX_U64 = (1n << 64n) - 1n;
const MAX_I128 = 1n << 127n;
const UNAVAILABLE = "Your campaign history could not be verified. Please retry.";
class InvalidHistory extends Error {}

type RawCampaign = {
  id: bigint; title: string; state: Campaign["state"][]; total: bigint; escrow: bigint;
  config: { creator: string; beneficiary: string; token: string; creator_cut_bps: number;
    funding_deadline: bigint; review_deadline: bigint; approvers: string[] };
  approvals: string[]; proof_hash: Uint8Array | null; proof_url: string;
};
const positiveU64 = (value: unknown): value is bigint => typeof value === "bigint" && value > 0n && value <= MAX_U64;
const nonnegativeI128 = (value: unknown): value is bigint => typeof value === "bigint" && value >= 0n && value < MAX_I128;
// The authenticated owner must be an account wallet, but D4 public Config
// fields are Soroban Addresses and may also identify contracts.
const address = (value: unknown): value is string => typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
const publicAddress = (value: unknown): value is string => address(value) || typeof value === "string" && StrKey.isValidContract(value);

/** Only validated public facts and this request's confirmed contribution leave the server. */
function campaignRecord(value: unknown, contractId: string): Omit<Campaign, "contribution"> {
  const c = value as RawCampaign;
  const config = c?.config;
  if (!c || !positiveU64(c.id) || typeof c.title !== "string" || c.title.length === 0
    || new TextEncoder().encode(c.title).length > 120
    || !Array.isArray(c.state) || c.state.length !== 1 || !["Funding", "PendingProof", "Refundable", "Released", "Closed"].includes(c.state[0])
    || !nonnegativeI128(c.total) || !nonnegativeI128(c.escrow) || c.escrow > c.total
    || !config || !publicAddress(config.creator) || !publicAddress(config.beneficiary)
    || config.creator === contractId || config.beneficiary === contractId || config.token !== CONTRACTS.tokenXlmSac
    || !Number.isInteger(config.creator_cut_bps) || config.creator_cut_bps < 0 || config.creator_cut_bps > 1000
    || !positiveU64(config.funding_deadline) || !positiveU64(config.review_deadline) || config.review_deadline <= config.funding_deadline
    || !Array.isArray(config.approvers) || config.approvers.length !== 3 || !config.approvers.every(publicAddress) || new Set(config.approvers).size !== 3
    || !Array.isArray(c.approvals) || c.approvals.length > 3 || c.approvals.some(value => !config.approvers.includes(value)) || new Set(c.approvals).size !== c.approvals.length
    || !(c.proof_hash === null || c.proof_hash instanceof Uint8Array && c.proof_hash.length === 32)
    || typeof c.proof_url !== "string" || new TextEncoder().encode(c.proof_url).length > 512) throw new InvalidHistory(UNAVAILABLE);
  let proofUrl = "";
  if (c.proof_url !== "") {
    try {
      const url = new URL(c.proof_url);
      if (url.protocol === "https:" && !url.username && !url.password && url.href.length <= 512) proofUrl = url.href;
    } catch { /* D4 allows arbitrary proof text. Never project an unsafe href. */ }
  }
  return { id: c.id.toString(), title: c.title, state: c.state[0],
    config: { creator: config.creator, beneficiary: config.beneficiary, token: config.token,
      creator_cut_bps: config.creator_cut_bps, funding_deadline: config.funding_deadline.toString(),
      review_deadline: config.review_deadline.toString(), approvers: [...config.approvers] },
    total: c.total.toString(), escrow: c.escrow.toString(), proofHash: c.proof_hash ? Buffer.from(c.proof_hash).toString("hex") : null,
    proofUrl, approvals: [...c.approvals] };
}

/** Personal history, not the newest discovery window. Bounded and resumable,
 * without provisioning, signing, wallet selectors or a shared personal cache. */
export async function readVaultCampaignHistory(before: unknown = "0", expectedOwnerId?: unknown): Promise<VaultCampaignHistory> {
  if (isLocalPreview) return { ok: false, error: "Local preview does not read live campaign history." };
  if (typeof before !== "string" || !/^(?:0|[1-9]\d{0,19})$/.test(before) || BigInt(before) > MAX_U64
    || expectedOwnerId !== undefined && (typeof expectedOwnerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(expectedOwnerId)))
    return { ok: false, error: "Invalid campaign history cursor or account." };
  const deadline = Date.now() + READ_DEADLINE_MS;
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(UNAVAILABLE);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Promise.race observes both outcomes even when the provider resolves or
      // rejects after the deadline; late work cannot advance a committed page.
      return await Promise.race([operation(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(UNAVAILABLE)), remaining);
      })]);
    } finally { clearTimeout(timer); }
  }
  try {
    const owner = await bounded(() => readAccountWallet());
    if (!owner.ok || typeof owner.ownerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner.ownerId)
      || !address(owner.address) || expectedOwnerId !== undefined && expectedOwnerId !== owner.ownerId)
      return { ok: false, error: "Sign in with the same account to load your campaign history." };
    const contractId = donationCampaignId();
    if (!contractId || !StrKey.isValidContract(contractId)) return { ok: false, error: UNAVAILABLE };
    // Optional display metadata overlaps the existing read wave and shares its
    // deadline. An absent mapping never removes verified personal history.
    const mappingsRead = bounded(() => readCircleDiscoveryMappings()).catch(() => []);
    const [version, token, now] = await bounded(() => Promise.all([
      readContract(contractId, "version"), readContract(contractId, "token"), readContract(contractId, "clock"),
    ]));
    if (version !== 4 || token !== CONTRACTS.tokenXlmSac || !positiveU64(now)) return { ok: false, error: UNAVAILABLE };
    const campaigns: Campaign[] = [];
    let cursor = BigInt(before), completedPages = 0;
    const result = async (complete: boolean): Promise<VaultCampaignHistory> => {
      let circleLinks: Record<string, string> = {};
      // Keep the shared JSON helper's null-prototype map off the Server Action
      // transport, which requires plain objects with Object.prototype.
      try { circleLinks = { ...circleDiscoveryLinks(campaigns, await mappingsRead) }; }
      catch { /* Display association is optional, never a history requirement. */ }
      return { ok: true, ownerId: owner.ownerId, viewer: owner.address, contractId, now: now.toString(),
        campaigns, nextCursor: complete ? null : cursor.toString(), complete, circleLinks };
    };
    for (let page = 0; page < MAX_PAGES; page++) {
      try {
        const raw = await bounded(() => readContract(contractId, "campaigns", [sc.u64(cursor), sc.u32(PAGE_SIZE)]));
        if (!Array.isArray(raw) || raw.length > PAGE_SIZE) throw new InvalidHistory(UNAVAILABLE);
        if (raw.length === 0) {
          if (cursor === 0n && completedPages === 0) return result(true);
          throw new InvalidHistory(UNAVAILABLE);
        }
        const records = raw.map(value => campaignRecord(value, contractId));
        if (records.some((record, index) => index === 0 ? cursor > 0n && BigInt(record.id) !== cursor - 1n
          : BigInt(record.id) !== BigInt(records[index - 1].id) - 1n)) throw new InvalidHistory(UNAVAILABLE);
        const lastId = BigInt(records.at(-1)!.id);
        if (records.length < PAGE_SIZE && lastId !== 1n) throw new InvalidHistory(UNAVAILABLE);
        const verified: Campaign[] = new Array(records.length);
        let next = 0, failed = false;
        await Promise.all(Array.from({ length: Math.min(4, records.length) }, async () => {
          while (!failed && next < records.length) {
            const index = next++, record = records[index];
            try {
              const contribution = await bounded(() => readContract(contractId, "contribution", [sc.u64(BigInt(record.id)), sc.addr(owner.address)])) as { amount: bigint; refunded: boolean };
              if (!contribution || !nonnegativeI128(contribution.amount) || typeof contribution.refunded !== "boolean") throw new InvalidHistory(UNAVAILABLE);
              verified[index] = { ...record, contribution: { amount: contribution.amount.toString(), refunded: contribution.refunded } };
            } catch (error) { failed = true; throw error; }
          }
        }));
        // Commit only whole pages. A late/failed contribution never silently
        // means zero and can never move the retry cursor past missing history.
        campaigns.push(...verified.filter(record => record.config.creator === owner.address || record.config.beneficiary === owner.address
          || record.config.approvers.includes(owner.address) || BigInt(record.contribution.amount) > 0n));
        cursor = lastId; completedPages++;
        if (lastId === 1n) return result(true);
      } catch (error) {
        if (completedPages === 0 && error instanceof InvalidHistory) return { ok: false, error: UNAVAILABLE };
        return result(false);
      }
    }
    return result(false);
  } catch { return { ok: false, error: UNAVAILABLE }; }
}
