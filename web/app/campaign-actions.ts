"use server";

import { rpc, scValToNative, type xdr } from "@stellar/stellar-sdk";
import { CONTRACTS, RPC_URL, readContract, invokeAs, sc, txLink, donationCampaignId } from "@/lib/server/stellar";
import { currentWalletPublicKey, getAuthenticatedSigner } from "@/lib/server/userWallet";
import { campaignAmount } from "@/lib/campaign-money";
import { campaignId, campaignError, campaignStruct, parseCampaignConfig, proofHash, publicProofUrl, type Campaign } from "@/lib/campaign";

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
export async function campaignState(id = "", before = "0") {
  try {
    const contractId = await deployment();
    const [raw, viewer, now] = await Promise.all([
      id ? readContract(contractId, "campaign", [sc.u64(campaignId(id))]).then(c => [c])
        : readContract(contractId, "campaigns", [sc.u64(campaignId(before, true)), sc.u32(10)]),
      currentWalletPublicKey(), readContract(contractId, "clock"),
    ]);
    const campaigns = await Promise.all((raw as RawCampaign[]).map(async c => {
      const contribution = viewer ? await readContract(contractId, "contribution", [sc.u64(c.id), sc.addr(viewer)]) as { amount: bigint; refunded: boolean } : null;
      return serialize(c, contribution ? { ...contribution, amount: contribution.amount.toString() } : undefined);
    }));
    return { ok: true as const, contractId, viewer, now: String(now), campaigns };
  } catch (error) { return { ok: false as const, error: campaignError(error) }; }
}
export async function campaignEvents() {
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
  try {
    const signer = await getAuthenticatedSigner();
    const id = await deployment();
    const { method, args } = await make(signer.publicKey, id);
    const result = await invokeAs(signer.secret, id, method, args);
    return result.ok ? { ok: true as const, hash: result.hash, link: txLink(result.hash), value: String(result.value ?? "") }
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
