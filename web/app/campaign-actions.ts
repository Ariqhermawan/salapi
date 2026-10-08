"use server";

import { rpc, scValToNative, StrKey, type xdr } from "@stellar/stellar-sdk";
import { CONTRACTS, RPC_URL, readContract, invokeAs, sc, txLink, donationCampaignId } from "@/lib/server/stellar";
import { currentWalletPublicKey, getAuthenticatedSigner } from "@/lib/server/userWallet";
import { campaignAmount } from "@/lib/campaign-money";
import { campaignId, campaignError, campaignStruct, parseCampaignConfig, proofHash, publicProofUrl, type Campaign } from "@/lib/campaign";
import { isLocalPreview } from "@/lib/local-preview";
import { readCircleDiscoveryMappings, circleDiscoveryLinks } from "@/lib/server/circlesTestnet";

type RawCampaign = Omit<Campaign, "id" | "config" | "total" | "escrow" | "state" | "proofHash" | "proofUrl" | "contribution"> & {
  id: bigint; config: Omit<Campaign["config"], "funding_deadline" | "review_deadline"> & { funding_deadline: bigint; review_deadline: bigint };
  total: bigint; escrow: bigint; state: [Campaign["state"]]; proof_hash: Buffer | null; proof_url: string;
};
async function deployment() {
  const id = donationCampaignId();
  if (!id) throw new Error("D4 campaign deployment configuration is invalid");
  const [version, token] = await Promise.all([readContract(id, "version"), readContract(id, "token")]);
  if (version !== 4 || token !== CONTRACTS.tokenXlmSac) throw new Error("Configured contract does not match D4 Testnet XLM controls");
  return id;
}
function serialize(c: RawCampaign, contribution = { amount: "0", refunded: false }): Campaign {
  return { id: c.id.toString(), title: c.title, state: c.state[0],
    config: { ...c.config, funding_deadline: c.config.funding_deadline.toString(), review_deadline: c.config.review_deadline.toString() },
    total: c.total.toString(), escrow: c.escrow.toString(), proofHash: c.proof_hash ? Buffer.from(c.proof_hash).toString("hex") : null,
    proofUrl: c.proof_url, approvals: c.approvals, contribution };
}
/** Discovery is a public projection, never a viewer's contribution or wallet. */
function publicCampaign(value: unknown): Omit<Campaign, "contribution"> {
  const c = value as RawCampaign;
  const config = c?.config;
  const validTime = (value: unknown): value is bigint => typeof value === "bigint" && value > 0n && value <= (1n << 64n) - 1n;
  const validAmount = (value: unknown): value is bigint => typeof value === "bigint" && value >= 0n && value < (1n << 127n);
  const address = (value: unknown): value is string => typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
  if (!c || !validTime(c.id) || typeof c.title !== "string" || !c.title.trim() || new TextEncoder().encode(c.title).length > 120
    || !Array.isArray(c.state) || c.state.length !== 1 || !["Funding", "PendingProof", "Refundable", "Released", "Closed"].includes(c.state[0])
    || !validAmount(c.total) || !validAmount(c.escrow) || c.escrow > c.total
    || !config || !address(config.creator) || !address(config.beneficiary) || config.token !== CONTRACTS.tokenXlmSac
    || !Number.isInteger(config.creator_cut_bps) || config.creator_cut_bps < 0 || config.creator_cut_bps > 1000
    || !validTime(config.funding_deadline) || !validTime(config.review_deadline) || config.review_deadline <= config.funding_deadline
    || !Array.isArray(config.approvers) || config.approvers.length !== 3 || !config.approvers.every(address) || new Set(config.approvers).size !== 3
    || !Array.isArray(c.approvals) || c.approvals.length > 3 || c.approvals.some(value => !config.approvers.includes(value)) || new Set(c.approvals).size !== c.approvals.length
    || !(c.proof_hash === null || c.proof_hash instanceof Uint8Array && c.proof_hash.length === 32)
    || typeof c.proof_url !== "string") throw new Error("Campaign discovery data is unavailable");
  const proofUrl = c.proof_url === "" ? "" : publicProofUrl(c.proof_url);
  return { id: c.id.toString(), title: c.title, state: c.state[0],
    config: { creator: config.creator, beneficiary: config.beneficiary, token: config.token, creator_cut_bps: config.creator_cut_bps,
      funding_deadline: config.funding_deadline.toString(), review_deadline: config.review_deadline.toString(), approvers: [...config.approvers] },
    total: c.total.toString(), escrow: c.escrow.toString(), proofHash: c.proof_hash ? Buffer.from(c.proof_hash).toString("hex") : null,
    proofUrl, approvals: [...c.approvals] };
}
/** Public Home pagination. Four bounded-size reads start together; no auth,
 * provisioning, signing, personalized contributions or shared data cache. */
export async function publicCampaignState(before: unknown = "0") {
  if (isLocalPreview) return { ok: false as const, error: "Local preview does not read live campaign state." };
  try {
    if (typeof before !== "string" || !/^(?:0|[1-9]\d{0,19})$/.test(before)) throw new Error("Invalid campaign ID");
    const cursor = campaignId(before, true);
    const contractId = donationCampaignId();
    if (!contractId || !StrKey.isValidContract(contractId)) throw new Error("D4 campaign deployment configuration is invalid");
    const [version, token, now, raw] = await Promise.all([
      readContract(contractId, "version"), readContract(contractId, "token"), readContract(contractId, "clock"),
      readContract(contractId, "campaigns", [sc.u64(cursor), sc.u32(10)]),
    ]);
    if (version !== 4 || token !== CONTRACTS.tokenXlmSac || typeof now !== "bigint" || now <= 0n || now > (1n << 64n) - 1n
      || !Array.isArray(raw) || raw.length > 10) throw new Error("Campaign discovery data is unavailable");
    const campaigns = raw.map(publicCampaign);
    // Contract paging is descending. Reject stale, duplicate or escaped cursors.
    if (campaigns.some((campaign, index) => (cursor > 0n && BigInt(campaign.id) >= cursor)
      || index > 0 && BigInt(campaign.id) >= BigInt(campaigns[index - 1].id))) throw new Error("Campaign discovery data is unavailable");
    return { ok: true as const, contractId, now: now.toString(), campaigns };
  } catch (error) { return { ok: false as const, error: campaignError(error) }; }
}
export async function campaignState(id = "", before = "0") {
  if (isLocalPreview) return { ok: false as const, error: "Local preview does not read live campaign state." };
  try {
    const contractId = await deployment();
    const selector = id ? campaignId(id) : campaignId(before, true);
    const mappingsRead = readCircleDiscoveryMappings().catch(() => []);
    const [raw, viewer, now] = await Promise.all([
      id ? readContract(contractId, "campaign", [sc.u64(selector)]).then(c => [c])
        : readContract(contractId, "campaigns", [sc.u64(selector), sc.u32(10)]),
      currentWalletPublicKey(), readContract(contractId, "clock"),
    ]);
    const campaigns = await Promise.all((raw as RawCampaign[]).map(async c => {
      const contribution = viewer ? await readContract(contractId, "contribution", [sc.u64(c.id), sc.addr(viewer)]) as { amount: bigint; refunded: boolean } : null;
      return serialize(c, contribution ? { ...contribution, amount: contribution.amount.toString() } : undefined);
    }));
    // Titles and full immutable config establish a display association only.
    // Campaign payloads remain the exact ledger and contribution projection.
    let circleLinks: Record<string, string> = {};
    try { circleLinks = circleDiscoveryLinks(campaigns, await mappingsRead); }
    catch { /* Optional catalog metadata cannot hide a live campaign. */ }
    return { ok: true as const, contractId, viewer, now: String(now), campaigns,
      ...(Object.keys(circleLinks).length ? { circleLinks } : {}) };
  } catch (error) { return { ok: false as const, error: campaignError(error) }; }
}
export async function campaignEvents() {
  if (isLocalPreview) return { ok: false as const, error: "Local preview does not read live campaign events." };
  try {
    const id = await deployment();
    const server = new rpc.Server(RPC_URL);
    const latest = await server.getLatestLedger();
    const response = await server.getEvents({ startLedger: Math.max(1, latest.sequence - 720),
      filters: [{ type: "contract", contractIds: [id] }], limit: 100 });
    return { ok: true as const, events: response.events.filter(e => e.inSuccessfulContractCall).reverse().map(e => ({
      id: e.id, hash: e.txHash, link: txLink(e.txHash), action: String(scValToNative(e.topic[0])),
      campaignId: e.topic[1] ? String(scValToNative(e.topic[1])) : "", time: e.ledgerClosedAt,
    })) };
  } catch { return { ok: false as const, error: "Recent campaign events unavailable. Archived evidence remains linked below." }; }
}
// Authentication is mandatory for every UI write, including donations/refunds.
// Caller addresses never come from request input; no shared-demo-wallet fallback.
async function write(make: (who: string, id: string) => Promise<{ method: string; args: xdr.ScVal[] }>) {
  if (isLocalPreview) return { ok: false as const, error: "Local preview cannot submit campaign transactions." };
  try {
    // Financial campaign writes require a saved, verified nonanonymous owner.
    // Never provision or choose a shared demo identity while confirming funds.
    const signer = await getAuthenticatedSigner();
    const id = await deployment();
    const { method, args } = await make(signer.publicKey, id);
    const result = await invokeAs(signer.secret, id, method, args);
    return result.ok ? { ok: true as const, hash: result.hash, link: txLink(result.hash), value: String(result.value ?? "") }
      : result.pending ? { ok: false as const, pending: true as const, hash: result.hash, link: txLink(result.hash), error: result.error }
      : { ok: false as const, error: campaignError(result.error) };
  } catch (error) { return { ok: false as const, error: campaignError(error) }; }
}
export async function campaignCreate(input: unknown) {
  return write(async (who, id) => {
    const v = parseCampaignConfig(input, await readContract(id, "clock") as bigint);
    return { method: "create", args: [campaignStruct({ creator: sc.addr(who), beneficiary: sc.addr(v.beneficiary), token: sc.addr(CONTRACTS.tokenXlmSac),
      creator_cut_bps: sc.u32(Number(v.cutBps)), funding_deadline: sc.u64(v.funding), review_deadline: sc.u64(v.review),
      approvers: v.approvers.map(sc.addr) }), sc.str(v.title)] };
  });
}
export async function campaignDonate(id: string, input: unknown) {
  return write(async who => ({ method: "donate", args: [sc.u64(campaignId(id)), sc.addr(who), sc.i128(campaignAmount(input))] }));
}
export async function campaignSubmitProof(id: string, hash: string, url: string) {
  return write(async (who, contract) => {
    const c = await readContract(contract, "campaign", [sc.u64(campaignId(id))]) as RawCampaign;
    if (c.config.creator !== who) throw new Error("Only the campaign creator can submit proof");
    return { method: "submit_proof", args: [sc.u64(campaignId(id)), campaignStruct({ hash: sc.bytes(Buffer.from(proofHash(hash), "hex")), url: sc.str(publicProofUrl(url)) })] };
  });
}
export async function campaignApprove(id: string, hash: string) {
  return write(async who => ({ method: "approve", args: [sc.u64(campaignId(id)), sc.addr(who), sc.bytes(Buffer.from(proofHash(hash), "hex"))] }));
}
export async function campaignRelease(id: string) {
  return write(async () => ({ method: "release", args: [sc.u64(campaignId(id))] }));
}
export async function campaignRefund(id: string) {
  return write(async who => ({ method: "refund", args: [sc.u64(campaignId(id)), sc.addr(who)] }));
}
export async function campaignCloseEmpty(id: string) {
  return write(async () => ({ method: "close_empty", args: [sc.u64(campaignId(id))] }));
}
