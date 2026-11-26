"use server";

import { rpc, scValToNative, StrKey, type xdr } from "@stellar/stellar-sdk";
import { CONTRACTS, RPC_URL, readContract, sc, txLink, donationCampaignId,
  prepareContractCallAs, submitPreparedContractCallAs } from "@/lib/server/stellar";
import { currentWalletPublicKey, getAuthenticatedSigner } from "@/lib/server/userWallet";
import { campaignSplit } from "@/lib/campaign-money";
import { campaignId, campaignError, campaignStruct, parseCampaignConfig, proofHash, publicProofUrl, type Campaign } from "@/lib/campaign";
import { isLocalPreview } from "@/lib/local-preview";
import { readCircleDiscoveryMappings, circleDiscoveryLinks } from "@/lib/server/circlesTestnet";
import {
  cancelConfirmationIntent,
  consumeConfirmationIntent,
  createConfirmationIntent,
  getConfirmationWallet,
} from "@/lib/server/confirmationIntent";
import type { ConfirmationIntentAction } from "@/lib/confirmation-intent";
import { formatStroops } from "@/lib/format-stroops";

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
    // The JSON helper uses a null-prototype map. Server Actions require a
    // plain object, so project its own validated keys at this boundary.
    try { circleLinks = { ...circleDiscoveryLinks(campaigns, await mappingsRead) }; }
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
    const { latestLedger, oldestLedger } = await server.getHealth();
    const response = await server.getEvents({ startLedger: Math.max(oldestLedger, latestLedger - 720),
      filters: [{ type: "contract", contractIds: [id] }], limit: 100 });
    return { ok: true as const, events: response.events.filter(e => e.inSuccessfulContractCall).reverse().map(e => ({
      id: e.id, hash: e.txHash, link: txLink(e.txHash), action: String(scValToNative(e.topic[0])),
      campaignId: e.topic[1] ? String(scValToNative(e.topic[1])) : "", time: e.ledgerClosedAt,
    })) };
  } catch { return { ok: false as const, error: "Recent campaign events unavailable. Archived evidence remains linked below." }; }
}
type CampaignConfirmationRequest =
  | { kind: "create"; input: unknown }
  | { kind: "donate"; campaignId: string; amountStroops: string }
  | { kind: "submit_proof"; campaignId: string; hash: string; url: string }
  | { kind: "approve" | "release" | "refund" | "close_empty"; campaignId: string };

type CampaignConfirmationPayload = Record<string, unknown> & { kind: CampaignConfirmationRequest["kind"] };
type CampaignOperation = { method: string; args: xdr.ScVal[]; action: ConfirmationIntentAction; payload: CampaignConfirmationPayload; summary: string };
const I128_MAX = (1n << 127n) - 1n;
const campaignAction: Record<CampaignConfirmationRequest["kind"], ConfirmationIntentAction> = {
  create: "campaign_create", donate: "campaign_donate", submit_proof: "campaign_submit_proof",
  approve: "campaign_approve", release: "campaign_release", refund: "campaign_refund", close_empty: "campaign_close_empty",
};

function requestRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid campaign action");
  return value as Record<string, unknown>;
}

function parsedCampaign(raw: unknown): Omit<Campaign, "contribution"> {
  return publicCampaign(raw);
}

async function prepareCampaignOperation(
  request: CampaignConfirmationRequest,
  walletAddress: string,
  contractId: string,
): Promise<CampaignOperation> {
  if (request.kind === "create") {
    const now = await readContract(contractId, "clock");
    if (typeof now !== "bigint" || now <= 0n) throw new Error("Campaign clock is unavailable.");
    const parsed = parseCampaignConfig(request.input, now);
    const payload: CampaignConfirmationPayload = { kind: "create", title: parsed.title,
      creator: walletAddress, beneficiary: parsed.beneficiary, token: CONTRACTS.tokenXlmSac,
      creatorCutBps: parsed.cutBps.toString(), fundingDeadline: parsed.funding.toString(),
      reviewDeadline: parsed.review.toString(), approvers: parsed.approvers };
    const config = campaignStruct({ creator: sc.addr(walletAddress), beneficiary: sc.addr(parsed.beneficiary), token: sc.addr(CONTRACTS.tokenXlmSac),
      creator_cut_bps: sc.u32(Number(parsed.cutBps)), funding_deadline: sc.u64(parsed.funding), review_deadline: sc.u64(parsed.review),
      approvers: parsed.approvers.map(sc.addr) });
    return { method: "create", args: [config, sc.str(parsed.title)], action: "campaign_create", payload,
      summary: `Create “${parsed.title}” on Stellar Testnet. Creator: ${walletAddress}. Beneficiary: ${parsed.beneficiary}. Creator share: ${Number(parsed.cutBps) / 100}%. Funding closes ${new Date(Number(parsed.funding) * 1000).toISOString()}; review closes ${new Date(Number(parsed.review) * 1000).toISOString()}. Approvers: ${parsed.approvers.join(", ")}.` };
  }

  const id = campaignId(request.campaignId);
  const [raw, clockValue] = await Promise.all([
    readContract(contractId, "campaign", [sc.u64(id)]), readContract(contractId, "clock"),
  ]);
  const campaign = parsedCampaign(raw);
  if (typeof clockValue !== "bigint" || clockValue <= 0n) throw new Error("Campaign clock is unavailable.");
  const now = clockValue;
  const snapshot = { title: campaign.title, creator: campaign.config.creator, beneficiary: campaign.config.beneficiary,
    token: campaign.config.token, creatorCutBps: String(campaign.config.creator_cut_bps),
    fundingDeadline: campaign.config.funding_deadline, reviewDeadline: campaign.config.review_deadline,
    proofHash: campaign.proofHash, approvals: [...campaign.approvals], total: campaign.total, escrow: campaign.escrow };
  const common = { campaignId: id.toString(), snapshot };

  switch (request.kind) {
    case "donate": {
      if (typeof request.amountStroops !== "string" || !/^[1-9]\d{0,37}$/.test(request.amountStroops)
        || BigInt(request.amountStroops) > I128_MAX) throw new Error("Enter a valid donation amount.");
      if (campaign.state !== "Funding" || now >= BigInt(campaign.config.funding_deadline))
        throw new Error("Campaign funding is closed. Refresh the campaign before continuing.");
      const amount = BigInt(request.amountStroops);
      return { method: "donate", action: "campaign_donate", payload: { kind: "donate", ...common, amountStroops: amount.toString() },
        args: [sc.u64(id), sc.addr(walletAddress), sc.i128(amount)],
        summary: `Donate ${formatStroops(amount)} Testnet XLM to “${campaign.title}”, campaign #${id}. Funds remain in escrow pending proof review.` };
    }
    case "submit_proof": {
      const hash = proofHash(request.hash), url = publicProofUrl(request.url);
      if (campaign.config.creator !== walletAddress) throw new Error("Only the campaign creator can submit proof.");
      if (campaign.state !== "Funding" || campaign.proofHash || now < BigInt(campaign.config.funding_deadline)
        || now >= BigInt(campaign.config.review_deadline)) throw new Error("The campaign is not accepting proof now.");
      return { method: "submit_proof", action: "campaign_submit_proof", payload: { kind: "submit_proof", ...common, hash, url },
        args: [sc.u64(id), campaignStruct({ hash: sc.bytes(Buffer.from(hash, "hex")), url: sc.str(url) })],
        summary: `Submit proof ${hash} and ${url} for “${campaign.title}”, campaign #${id}. It cannot be replaced.` };
    }
    case "approve": {
      if (!campaign.config.approvers.includes(walletAddress)) throw new Error("This wallet is not a configured campaign approver.");
      if (campaign.state !== "PendingProof" || !campaign.proofHash || campaign.approvals.includes(walletAddress)
        || now >= BigInt(campaign.config.review_deadline)) throw new Error("The proof cannot be approved in the current campaign state.");
      return { method: "approve", action: "campaign_approve", payload: { kind: "approve", ...common,
        proofHash: campaign.proofHash, approver: walletAddress },
        args: [sc.u64(id), sc.addr(walletAddress), sc.bytes(Buffer.from(campaign.proofHash, "hex"))],
        summary: `Approve proof ${campaign.proofHash} for “${campaign.title}”, campaign #${id}.` };
    }
    case "release": {
      if (campaign.state !== "PendingProof" || !campaign.proofHash || campaign.approvals.length < 2)
        throw new Error("Two approvals for the current proof are required before release.");
      const split = campaignSplit(BigInt(campaign.escrow), BigInt(campaign.config.creator_cut_bps));
      return { method: "release", action: "campaign_release", payload: { kind: "release", ...common },
        args: [sc.u64(id)], summary: `Release campaign #${id} for “${campaign.title}”. ${formatStroops(split.creator)} XLM goes to creator ${campaign.config.creator}; ${formatStroops(split.beneficiary)} XLM goes to beneficiary ${campaign.config.beneficiary}.` };
    }
    case "refund": {
      if (["Released", "Closed"].includes(campaign.state) || now < BigInt(campaign.config.review_deadline)
        || campaign.approvals.length >= 2) throw new Error("A refund is not available in the current campaign state.");
      const contribution = await readContract(contractId, "contribution", [sc.u64(id), sc.addr(walletAddress)]) as { amount?: unknown; refunded?: unknown } | null;
      if (!contribution || typeof contribution.amount !== "bigint" || contribution.amount <= 0n || contribution.refunded !== false)
        throw new Error("This wallet has no unclaimed campaign donation to refund.");
      return { method: "refund", action: "campaign_refund", payload: { kind: "refund", ...common,
        donor: walletAddress, amountStroops: contribution.amount.toString() },
        args: [sc.u64(id), sc.addr(walletAddress)],
        summary: `Return your full donation of ${formatStroops(contribution.amount)} Testnet XLM from “${campaign.title}”, campaign #${id}, to your wallet.` };
    }
    case "close_empty": {
      if (["Released", "Closed"].includes(campaign.state) || now < BigInt(campaign.config.review_deadline)
        || BigInt(campaign.total) !== 0n || campaign.approvals.length >= 2)
        throw new Error("This campaign cannot be closed as empty.");
      return { method: "close_empty", action: "campaign_close_empty", payload: { kind: "close_empty", ...common },
        args: [sc.u64(id)], summary: `Close empty campaign #${id} for “${campaign.title}”. It has no donations and no qualifying proof quorum.` };
    }
  }
}

/** Prepare the exact unsigned XDR before showing the in-app review dialog. */
export async function prepareCampaignConfirmation(input: unknown) {
  if (isLocalPreview) return { ok: false as const, error: "Local preview does not prepare Testnet transactions." };
  try {
    const value = requestRecord(input);
    if (!(value.kind === "create" || value.kind === "donate" || value.kind === "submit_proof"
      || value.kind === "approve" || value.kind === "release" || value.kind === "refund" || value.kind === "close_empty"))
      throw new Error("Invalid campaign action.");
    const request = value as CampaignConfirmationRequest;
    const wallet = await getConfirmationWallet();
    const contractId = await deployment();
    const operation = await prepareCampaignOperation(request, wallet.address, contractId);
    const prepared = await prepareContractCallAs(wallet.address, contractId, operation.method, operation.args);
    const intent = await createConfirmationIntent({ action: operation.action, payload: operation.payload,
      transactionXdr: prepared.transactionXdr, feeStroops: prepared.feeStroops, expectedWallet: wallet });
    return { ok: true as const, intentId: intent.id, action: operation.action, summary: operation.summary,
      feeStroops: intent.feeStroops, expiresAt: intent.expiresAt };
  } catch (error) { return { ok: false as const, error: campaignError(error) }; }
}

function stringField(record: Record<string, unknown>, name: string): string {
  const value = record[name];
  if (typeof value !== "string") throw new Error("The saved campaign confirmation is invalid.");
  return value;
}

async function validateCampaignIntent(
  payloadValue: unknown,
  walletAddress: string,
  contractId: string,
): Promise<{ kind: CampaignConfirmationRequest["kind"]; method: string; args: xdr.ScVal[] }> {
  const payload = requestRecord(payloadValue);
  const kind = payload.kind;
  if (kind === "create") {
    const title = stringField(payload, "title"), creator = stringField(payload, "creator");
    const beneficiary = stringField(payload, "beneficiary"), token = stringField(payload, "token");
    const cut = stringField(payload, "creatorCutBps"), funding = stringField(payload, "fundingDeadline");
    const review = stringField(payload, "reviewDeadline");
    if (creator !== walletAddress || token !== CONTRACTS.tokenXlmSac || !StrKey.isValidEd25519PublicKey(beneficiary)
      || !/^(?:0|[1-9]\d{0,3})$/.test(cut) || BigInt(cut) > 1000n
      || !Array.isArray(payload.approvers) || payload.approvers.length !== 3
      || !payload.approvers.every(value => typeof value === "string" && StrKey.isValidEd25519PublicKey(value))
      || new Set(payload.approvers).size !== 3) throw new Error("The saved campaign terms are invalid.");
    const now = await readContract(contractId, "clock");
    if (typeof now !== "bigint" || BigInt(funding) <= now || BigInt(review) <= BigInt(funding))
      throw new Error("The campaign deadlines changed. Review the terms again.");
    const config = campaignStruct({ creator: sc.addr(creator), beneficiary: sc.addr(beneficiary), token: sc.addr(token),
      creator_cut_bps: sc.u32(Number(cut)), funding_deadline: sc.u64(BigInt(funding)), review_deadline: sc.u64(BigInt(review)),
      approvers: (payload.approvers as string[]).map(sc.addr) });
    return { kind, method: "create", args: [config, sc.str(title)] };
  }

  const id = campaignId(stringField(payload, "campaignId"));
  const [raw, clockValue] = await Promise.all([
    readContract(contractId, "campaign", [sc.u64(id)]), readContract(contractId, "clock"),
  ]);
  const campaign = parsedCampaign(raw);
  if (typeof clockValue !== "bigint" || clockValue <= 0n) throw new Error("Campaign clock is unavailable.");
  const now = clockValue;
  const snapshot = payload.snapshot && typeof payload.snapshot === "object" && !Array.isArray(payload.snapshot)
    ? payload.snapshot as Record<string, unknown> : null;
  if (!snapshot || snapshot.title !== campaign.title || snapshot.creator !== campaign.config.creator
    || snapshot.beneficiary !== campaign.config.beneficiary || snapshot.token !== campaign.config.token
    || snapshot.creatorCutBps !== String(campaign.config.creator_cut_bps)
    || snapshot.fundingDeadline !== campaign.config.funding_deadline
    || snapshot.reviewDeadline !== campaign.config.review_deadline || snapshot.proofHash !== campaign.proofHash)
    throw new Error("The campaign terms or proof changed. Refresh and review the action again.");

  switch (kind) {
    case "donate": {
      const amount = BigInt(stringField(payload, "amountStroops"));
      if (amount <= 0n || amount > I128_MAX || campaign.state !== "Funding" || now >= BigInt(campaign.config.funding_deadline))
        throw new Error("Campaign funding changed. Refresh and review the donation again.");
      return { kind, method: "donate", args: [sc.u64(id), sc.addr(walletAddress), sc.i128(amount)] };
    }
    case "submit_proof": {
      const hash = proofHash(stringField(payload, "hash")), url = publicProofUrl(stringField(payload, "url"));
      if (campaign.config.creator !== walletAddress || campaign.state !== "Funding" || campaign.proofHash
        || now < BigInt(campaign.config.funding_deadline) || now >= BigInt(campaign.config.review_deadline))
        throw new Error("The campaign is no longer accepting this proof.");
      return { kind, method: "submit_proof", args: [sc.u64(id), campaignStruct({ hash: sc.bytes(Buffer.from(hash, "hex")), url: sc.str(url) })] };
    }
    case "approve": {
      const hash = proofHash(stringField(payload, "proofHash"));
      if (stringField(payload, "approver") !== walletAddress || !campaign.config.approvers.includes(walletAddress)
        || campaign.state !== "PendingProof" || campaign.proofHash !== hash || campaign.approvals.includes(walletAddress)
        || now >= BigInt(campaign.config.review_deadline)) throw new Error("The proof or approval eligibility changed. Review the campaign again.");
      return { kind, method: "approve", args: [sc.u64(id), sc.addr(walletAddress), sc.bytes(Buffer.from(hash, "hex"))] };
    }
    case "release": {
      if (campaign.state !== "PendingProof" || !campaign.proofHash || campaign.approvals.length < 2
        || snapshot.escrow !== campaign.escrow || JSON.stringify(snapshot.approvals) !== JSON.stringify(campaign.approvals))
        throw new Error("Campaign release terms changed. Refresh and review the payout again.");
      return { kind, method: "release", args: [sc.u64(id)] };
    }
    case "refund": {
      const donor = stringField(payload, "donor"), expectedAmount = BigInt(stringField(payload, "amountStroops"));
      if (donor !== walletAddress || ["Released", "Closed"].includes(campaign.state)
        || now < BigInt(campaign.config.review_deadline) || campaign.approvals.length >= 2)
        throw new Error("A campaign refund is no longer available.");
      const contribution = await readContract(contractId, "contribution", [sc.u64(id), sc.addr(walletAddress)]) as { amount?: unknown; refunded?: unknown } | null;
      if (!contribution || contribution.amount !== expectedAmount || contribution.refunded !== false)
        throw new Error("Your recorded donation changed. Refresh and review the refund again.");
      return { kind, method: "refund", args: [sc.u64(id), sc.addr(walletAddress)] };
    }
    case "close_empty": {
      if (["Released", "Closed"].includes(campaign.state) || now < BigInt(campaign.config.review_deadline)
        || campaign.total !== "0" || campaign.approvals.length >= 2)
        throw new Error("This campaign is no longer eligible to close as empty.");
      return { kind, method: "close_empty", args: [sc.u64(id)] };
    }
  }
  throw new Error("The saved campaign action is invalid.");
}

async function submitCampaignIntent(intentId: string, expectedAction: ConfirmationIntentAction) {
  if (isLocalPreview) return { ok: false as const, error: "Local preview cannot submit campaign transactions." };
  try {
    const intent = await consumeConfirmationIntent(intentId, expectedAction);
    const wallet = await getAuthenticatedSigner(intent.ownerId);
    if (wallet.demo || wallet.publicKey !== intent.walletAddress)
      throw new Error("Your signed-in wallet changed. Review the campaign action again.");
    const contractId = await deployment();
    const operation = await validateCampaignIntent(intent.payload, wallet.publicKey, contractId);
    if (campaignAction[operation.kind] !== expectedAction) throw new Error("This confirmation does not match the campaign action.");
    const result = await submitPreparedContractCallAs(wallet.secret, intent.transactionXdr, {
      source: wallet.publicKey, contractId, method: operation.method, args: operation.args,
      feeStroops: intent.feeStroops,
    });
    return result.ok ? { ok: true as const, hash: result.hash, link: txLink(result.hash), value: String(result.value ?? "") }
      : result.pending ? { ok: false as const, pending: true as const, hash: result.hash,
        link: txLink(result.hash), error: campaignError(result.error) }
      : { ok: false as const, error: campaignError(result.error) };
  } catch (error) { return { ok: false as const, error: campaignError(error) }; }
}

export async function campaignCreate(intentId: string) { return submitCampaignIntent(intentId, "campaign_create"); }
export async function campaignDonate(intentId: string) { return submitCampaignIntent(intentId, "campaign_donate"); }
export async function campaignSubmitProof(intentId: string) { return submitCampaignIntent(intentId, "campaign_submit_proof"); }
export async function campaignApprove(intentId: string) { return submitCampaignIntent(intentId, "campaign_approve"); }
export async function campaignRelease(intentId: string) { return submitCampaignIntent(intentId, "campaign_release"); }
export async function campaignRefund(intentId: string) { return submitCampaignIntent(intentId, "campaign_refund"); }
export async function campaignCloseEmpty(intentId: string) { return submitCampaignIntent(intentId, "campaign_close_empty"); }

export async function cancelCampaignConfirmation(intentId: string, action: string) {
  if (!Object.values(campaignAction).includes(action as ConfirmationIntentAction)) return { ok: false as const };
  try { return { ok: await cancelConfirmationIntent(intentId, action as ConfirmationIntentAction) }; }
  catch { return { ok: false as const }; }
}
