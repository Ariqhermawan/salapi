"use server";

import { StrKey, type xdr } from "@stellar/stellar-sdk";
import { CONTRACTS, readContract, sc, txLink,
  prepareContractCallAs, submitPreparedContractCallAs } from "@/lib/server/stellar";
import { currentWalletPublicKey, getAuthenticatedSigner } from "@/lib/server/userWallet";
import { campaignSplit } from "@/lib/campaign-money";
import { formatStroops } from "@/lib/format-stroops";
import { isLocalPreview } from "@/lib/local-preview";
import { campaignError, campaignStruct } from "@/lib/campaign";
import {
  parseRecurringCampaign, parseRecurringCreateInput, parseRecurringContribution, type RecurringContribution,
  recurringCampaignId, recurringCampaignNumericId, recurringConfigArgs, recurringStageArgs,
  recurringStageRefundable, proofHash, publicProofUrl,
} from "@/lib/recurring-campaign";
import { cancelConfirmationIntent, consumeConfirmationIntent, createConfirmationIntent,
  getConfirmationWallet } from "@/lib/server/confirmationIntent";
import type { ConfirmationIntentAction } from "@/lib/confirmation-intent";

const ACTIONS: Record<RecurringRequest["kind"], ConfirmationIntentAction> = {
  create: "recurring_campaign_create", donate: "recurring_campaign_donate",
  submit_proof: "recurring_campaign_submit_proof", approve: "recurring_campaign_approve",
  release: "recurring_campaign_release", refund: "recurring_campaign_refund",
  close_empty: "recurring_campaign_close_empty",
};
const I128_MAX = (1n << 127n) - 1n;

type RecurringRequest =
  | { kind: "create"; input: unknown }
  | { kind: "donate"; campaignId: string; amountStroops: string }
  | { kind: "submit_proof"; campaignId: string; hash: string; url: string }
  | { kind: "approve" | "release" | "refund" | "close_empty"; campaignId: string };
type Operation = { method: string; args: xdr.ScVal[]; action: ConfirmationIntentAction;
  payload: Record<string, unknown> & { kind: RecurringRequest["kind"] }; summary: string };

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid recurring campaign action");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`The saved ${label} is invalid`);
  return value;
}
function recurringError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = message.match(/Error\(Contract, #(\d+)\)/)?.[1];
  const errors: Record<string, string> = {
    "1": "Recurring campaign not found. Refresh the page and try again.",
    "2": "Choose three distinct reviewer wallets.", "3": "Funding and review deadlines are invalid.",
    "4": "The recurring campaign terms are invalid.", "5": "Enter a positive Testnet XLM amount.",
    "6": "The funding deadline has passed.", "7": "This action is unavailable in the current stage.",
    "8": "The stage deadline has not passed yet.", "9": "The final review deadline has passed.",
    "10": "A proof is already submitted for this stage.", "11": "The proof hash is invalid.",
    "12": "This wallet is not a configured reviewer.", "13": "This wallet already approved this proof.",
    "14": "Two different reviewers must approve before payout.", "15": "Refunds are available only for unspent stages after final review.",
    "16": "This wallet has no unspent stage contribution to refund.", "17": "The amount exceeds supported limits.",
    "18": "A recurring campaign needs two to six ordered stages.", "19": "The current stage is not fully funded.",
  };
  return code && errors[code] ? errors[code] : campaignError(error);
}

async function deployment(): Promise<string> {
  const id = (process.env.RECURRING_CAMPAIGN_CONTRACT ?? CONTRACTS.recurringCampaign).trim();
  if (!id || !StrKey.isValidContract(id)) throw new Error("Recurring Testnet contract is not configured yet.");
  const [version, token] = await Promise.all([readContract(id, "version"), readContract(id, "token")]);
  if (version !== 5 || token !== CONTRACTS.tokenXlmSac) throw new Error("Configured contract does not match recurring v5 Testnet XLM controls");
  return id;
}

function publicCampaign(value: unknown) {
  const campaign = parseRecurringCampaign(value);
  if (campaign.config.token !== CONTRACTS.tokenXlmSac) throw new Error("Recurring campaign token does not match Testnet XLM");
  return campaign;
}

function snapshot(campaign: ReturnType<typeof parseRecurringCampaign>) {
  return { title: campaign.title, creator: campaign.config.creator, beneficiary: campaign.config.beneficiary,
    token: campaign.config.token, creatorCutBps: String(campaign.config.creator_cut_bps),
    fundingDeadline: campaign.config.funding_deadline, reviewDeadline: campaign.config.review_deadline,
    proofHash: campaign.proofHash, approvals: [...campaign.approvals], total: campaign.total, escrow: campaign.escrow,
    currentStage: campaign.current_stage, stages: campaign.stages.map(stage => ({ ...stage })) };
}

function sameStageSnapshot(value: unknown, stages: ReturnType<typeof parseRecurringCampaign>["stages"]): boolean {
  return Array.isArray(value) && value.length === stages.length && value.every((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const stage = item as Record<string, unknown>;
    const current = stages[index];
    return stage.amount === current.amount && stage.due_date === current.due_date
      && stage.funded === current.funded && stage.released === current.released;
  });
}

function sameContribution(value: unknown, current: RecurringContribution): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const contribution = value as Record<string, unknown>;
  return contribution.amount === current.amount && contribution.refunded === current.refunded
    && Array.isArray(contribution.stages) && contribution.stages.length === current.stages.length
    && contribution.stages.every((stage, index) => stage === current.stages[index]);
}

async function readCampaign(contractId: string, numericId: bigint) {
  return publicCampaign(await readContract(contractId, "campaign", [sc.u64(numericId)]));
}

/** Public discovery plus only the signed-in viewer's own stage allocations. */
export async function recurringCampaignState(id = "", before = "0") {
  if (isLocalPreview) return { ok: false as const, error: "Local preview does not query Testnet recurring campaigns." };
  try {
    if (id && !/^r[1-9]\d{0,19}$/.test(id)) throw new Error("Invalid recurring campaign ID");
    if (!/^(?:0|[1-9]\d{0,19})$/.test(before)) throw new Error("Invalid recurring campaign cursor");
    const contractId = await deployment();
    const [now, viewer] = await Promise.all([readContract(contractId, "clock"), currentWalletPublicKey()]);
    if (typeof now !== "bigint" || now <= 0n) throw new Error("Recurring campaign clock is unavailable");
    const raw = id
      ? [await readContract(contractId, "campaign", [sc.u64(recurringCampaignId(id))])]
      : await readContract(contractId, "campaigns", [sc.u64(recurringCampaignNumericId(before, true)), sc.u32(10)]);
    if (!Array.isArray(raw) || raw.length > 10) throw new Error("Recurring campaign discovery data is unavailable");
    const campaigns = await Promise.all(raw.map(async value => {
      const item = publicCampaign(value);
      const contribution = viewer
        ? await readContract(contractId, "contribution", [sc.u64(BigInt(item.id)), sc.addr(viewer)])
        : null;
      return { ...item, contribution: contribution === null ? null : parseRecurringContribution(contribution, item.stages.length) };
    }));
    const cursor = recurringCampaignNumericId(before, true);
    if (!id && campaigns.some((item, index) => (cursor > 0n && BigInt(item.id) >= cursor)
      || index > 0 && BigInt(item.id) >= BigInt(campaigns[index - 1].id)))
      throw new Error("Recurring campaign discovery data is unavailable");
    return { ok: true as const, contractId, viewer, now: now.toString(), campaigns };
  } catch (error) { return { ok: false as const, error: recurringError(error) }; }
}

async function prepareOperation(request: RecurringRequest, wallet: string, contractId: string): Promise<Operation> {
  if (request.kind === "create") {
    const now = await readContract(contractId, "clock");
    if (typeof now !== "bigint" || now <= 0n) throw new Error("Recurring campaign clock is unavailable");
    const parsed = parseRecurringCreateInput(request.input, now);
    const payload = { kind: "create" as const, title: parsed.title, creator: wallet,
      beneficiary: parsed.beneficiary, token: CONTRACTS.tokenXlmSac,
      creatorCutBps: parsed.cutBps.toString(), fundingDeadline: parsed.funding.toString(),
      reviewDeadline: parsed.review.toString(), approvers: parsed.approvers,
      stages: parsed.stages.map(stage => ({ amount: stage.amount.toString(), dueDate: stage.due_date.toString() })) };
    const config = recurringConfigArgs({ creator: wallet, beneficiary: parsed.beneficiary, token: CONTRACTS.tokenXlmSac,
      creatorCutBps: Number(parsed.cutBps), fundingDeadline: parsed.funding, reviewDeadline: parsed.review, approvers: parsed.approvers });
    return { method: "create", action: ACTIONS.create, payload,
      args: [config, sc.str(parsed.title), recurringStageArgs(parsed.stages)],
      summary: `Create recurring Testnet campaign “${parsed.title}” with ${parsed.stages.length} ordered payout stages. Donations fill stage targets in order. Each payout needs proof and two of three configured reviewers. After final review, only unspent stages can be refunded.` };
  }

  const numericId = recurringCampaignId(request.campaignId);
  const [campaign, now] = await Promise.all([readCampaign(contractId, numericId), readContract(contractId, "clock")]);
  if (typeof now !== "bigint" || now <= 0n) throw new Error("Recurring campaign clock is unavailable");
  const common = { campaignId: numericId.toString(), snapshot: snapshot(campaign) };
  switch (request.kind) {
    case "donate": {
      if (typeof request.amountStroops !== "string" || !/^[1-9]\d{0,37}$/.test(request.amountStroops)) throw new Error("Enter a valid Testnet XLM amount");
      const amount = BigInt(request.amountStroops);
      if (amount > I128_MAX || campaign.state !== "Funding" || now >= BigInt(campaign.config.funding_deadline))
        throw new Error("Recurring campaign funding is closed. Refresh before continuing.");
      const goal = campaign.stages.reduce((total, stage) => total + BigInt(stage.amount), 0n);
      if (BigInt(campaign.total) + amount > goal) throw new Error("The donation is larger than the remaining staged targets.");
      return { method: "donate", action: ACTIONS.donate, payload: { kind: request.kind, ...common, amountStroops: amount.toString() },
        args: [sc.u64(numericId), sc.addr(wallet), sc.i128(amount)],
        summary: `Contribute ${formatStroops(amount)} Testnet XLM to “${campaign.title}”. The contract allocates this amount to stage targets in order.` };
    }
    case "submit_proof": {
      const hash = proofHash(request.hash), url = publicProofUrl(request.url);
      const stage = campaign.stages[campaign.current_stage];
      if (campaign.config.creator !== wallet || campaign.state !== "Scheduled" || campaign.proofHash
        || now < BigInt(campaign.config.funding_deadline) || !stage || now < BigInt(stage.due_date)
        || BigInt(stage.funded) !== BigInt(stage.amount) || now >= BigInt(campaign.config.review_deadline))
        throw new Error("The current fully funded stage is not accepting proof now.");
      return { method: "submit_proof", action: ACTIONS.submit_proof, payload: { kind: request.kind, ...common, hash, url },
        args: [sc.u64(numericId), campaignStruct({ hash: sc.bytes(Buffer.from(hash, "hex")), url: sc.str(url) })],
        summary: `Submit proof ${hash} for stage ${campaign.current_stage + 1} of “${campaign.title}”. The proof cannot be replaced.` };
    }
    case "approve": {
      if (!campaign.config.approvers.includes(wallet) || campaign.state !== "PendingProof" || !campaign.proofHash
        || campaign.approvals.includes(wallet) || now >= BigInt(campaign.config.review_deadline))
        throw new Error("This wallet cannot approve the current stage proof.");
      return { method: "approve", action: ACTIONS.approve, payload: { kind: request.kind, ...common, approver: wallet, proofHash: campaign.proofHash },
        args: [sc.u64(numericId), sc.addr(wallet), sc.bytes(Buffer.from(campaign.proofHash, "hex"))],
        summary: `Approve the submitted proof for stage ${campaign.current_stage + 1} of “${campaign.title}”.` };
    }
    case "release": {
      const stage = campaign.stages[campaign.current_stage];
      if (campaign.state !== "PendingProof" || !campaign.proofHash || campaign.approvals.length < 2 || !stage
        || BigInt(stage.funded) !== BigInt(stage.amount)) throw new Error("Two approvals for the current stage proof are required before payout.");
      const split = campaignSplit(BigInt(stage.amount), BigInt(campaign.config.creator_cut_bps));
      return { method: "release", action: ACTIONS.release, payload: { kind: request.kind, ...common }, args: [sc.u64(numericId)],
        summary: `Release stage ${campaign.current_stage + 1} of “${campaign.title}”: ${formatStroops(split.creator)} Testnet XLM to the creator and ${formatStroops(split.beneficiary)} Testnet XLM to the beneficiary.` };
    }
    case "refund": {
      if (campaign.state !== "Refundable" || now < BigInt(campaign.config.review_deadline)) throw new Error("Only unspent stages are refundable after final review.");
      const raw = await readContract(contractId, "contribution", [sc.u64(numericId), sc.addr(wallet)]);
      const contribution = parseRecurringContribution(raw, campaign.stages.length);
      const refundable = recurringStageRefundable(contribution, campaign.current_stage);
      if (contribution.refunded || refundable <= 0n) throw new Error("This wallet has no unspent stage contribution to refund.");
      return { method: "refund", action: ACTIONS.refund, payload: { kind: request.kind, ...common,
        donor: wallet, refundable: refundable.toString(), contribution }, args: [sc.u64(numericId), sc.addr(wallet)],
        summary: `Refund ${formatStroops(refundable)} Testnet XLM from your unspent stages in “${campaign.title}”. Amounts already released stay with their recipients.` };
    }
    case "close_empty": {
      if (campaign.state !== "Refundable" || now < BigInt(campaign.config.review_deadline) || campaign.total !== "0")
        throw new Error("Only an empty recurring campaign can be closed after final review.");
      return { method: "close_empty", action: ACTIONS.close_empty, payload: { kind: request.kind, ...common },
        args: [sc.u64(numericId)], summary: `Close empty recurring campaign “${campaign.title}” after final review.` };
    }
  }
}

export async function prepareRecurringCampaignConfirmation(input: unknown) {
  if (isLocalPreview) return { ok: false as const, error: "Local preview cannot prepare Testnet transactions." };
  try {
    const value = record(input);
    if (!(value.kind === "create" || value.kind === "donate" || value.kind === "submit_proof"
      || value.kind === "approve" || value.kind === "release" || value.kind === "refund" || value.kind === "close_empty"))
      throw new Error("Invalid recurring campaign action");
    const request = value as RecurringRequest;
    const wallet = await getConfirmationWallet();
    const contractId = await deployment();
    const operation = await prepareOperation(request, wallet.address, contractId);
    const prepared = await prepareContractCallAs(wallet.address, contractId, operation.method, operation.args);
    const intent = await createConfirmationIntent({ action: operation.action, payload: operation.payload,
      transactionXdr: prepared.transactionXdr, feeStroops: prepared.feeStroops, expectedWallet: wallet });
    return { ok: true as const, intentId: intent.id, action: operation.action, summary: operation.summary,
      feeStroops: intent.feeStroops, expiresAt: intent.expiresAt };
  } catch (error) { return { ok: false as const, error: recurringError(error) }; }
}

async function validateIntent(payloadValue: unknown, wallet: string, contractId: string): Promise<{ kind: RecurringRequest["kind"]; method: string; args: xdr.ScVal[] }> {
  const payload = record(payloadValue);
  const kind = payload.kind;
  if (kind === "create") {
    const title = text(payload.title, "recurring campaign title");
    const creator = text(payload.creator, "recurring campaign creator");
    const beneficiary = text(payload.beneficiary, "recurring campaign beneficiary");
    const token = text(payload.token, "recurring campaign token");
    const cut = text(payload.creatorCutBps, "creator share");
    const funding = text(payload.fundingDeadline, "funding deadline");
    const review = text(payload.reviewDeadline, "review deadline");
    if (creator !== wallet || token !== CONTRACTS.tokenXlmSac || !StrKey.isValidEd25519PublicKey(beneficiary)
      || !/^(?:0|[1-9]\d{0,3})$/.test(cut) || BigInt(cut) > 1000n
      || !Array.isArray(payload.approvers) || payload.approvers.length !== 3
      || !payload.approvers.every(value => typeof value === "string" && StrKey.isValidEd25519PublicKey(value))
      || new Set(payload.approvers).size !== 3 || !Array.isArray(payload.stages) || payload.stages.length < 2 || payload.stages.length > 6)
      throw new Error("The saved recurring campaign terms are invalid");
    const now = await readContract(contractId, "clock");
    if (typeof now !== "bigint" || BigInt(funding) <= now || BigInt(review) <= BigInt(funding))
      throw new Error("Recurring campaign deadlines changed. Review the terms again.");
    const stages = payload.stages.map((value: unknown) => {
      const stage = record(value);
      const amount = text(stage.amount, "stage target"), dueDate = text(stage.dueDate, "stage date");
      if (!/^[1-9]\d{0,37}$/.test(amount)) throw new Error("The saved stage target is invalid");
      return { amount: BigInt(amount), due_date: recurringCampaignNumericId(dueDate) };
    });
    const checked = parseRecurringCreateInput({ title, beneficiary, creatorCut: `${Number(cut) / 100}`,
      fundingDeadline: funding, reviewDeadline: review, approvers: payload.approvers, stages: stages.map(stage => ({
        amountStroops: stage.amount.toString(), dueDate: stage.due_date.toString(),
      })) }, now);
    if (checked.cutBps.toString() !== cut) throw new Error("The saved creator share is invalid");
    const config = recurringConfigArgs({ creator, beneficiary, token, creatorCutBps: Number(cut),
      fundingDeadline: BigInt(funding), reviewDeadline: BigInt(review), approvers: payload.approvers as string[] });
    return { kind: "create", method: "create", args: [config, sc.str(title), recurringStageArgs(stages)] };
  }

  if (!(["donate", "submit_proof", "approve", "release", "refund", "close_empty"] as const).includes(kind as never))
    throw new Error("The saved recurring campaign action is invalid");
  const actionKind = kind as Exclude<RecurringRequest["kind"], "create">;
  const numericId = recurringCampaignNumericId(text(payload.campaignId, "campaign ID"));
  const [campaign, clockValue] = await Promise.all([readCampaign(contractId, numericId), readContract(contractId, "clock")]);
  if (typeof clockValue !== "bigint" || clockValue <= 0n) throw new Error("Recurring campaign clock is unavailable");
  const now = clockValue;
  const expected = payload.snapshot && typeof payload.snapshot === "object" && !Array.isArray(payload.snapshot)
    ? payload.snapshot as Record<string, unknown> : null;
  const current = snapshot(campaign);
  if (!expected || expected.title !== current.title || expected.creator !== current.creator || expected.beneficiary !== current.beneficiary
    || expected.token !== current.token || expected.creatorCutBps !== current.creatorCutBps
    || expected.fundingDeadline !== current.fundingDeadline || expected.reviewDeadline !== current.reviewDeadline
    || expected.proofHash !== current.proofHash || expected.currentStage !== current.currentStage
    || expected.escrow !== current.escrow || expected.total !== current.total
    || JSON.stringify(expected.approvals) !== JSON.stringify(current.approvals)
    || !sameStageSnapshot(expected.stages, current.stages))
    throw new Error("Recurring stage terms or proof changed. Refresh and review the action again.");
  switch (actionKind) {
    case "donate": {
      const amount = BigInt(text(payload.amountStroops, "contribution amount"));
      const goal = campaign.stages.reduce((total, stage) => total + BigInt(stage.amount), 0n);
      if (amount <= 0n || amount > I128_MAX || campaign.state !== "Funding" || now >= BigInt(campaign.config.funding_deadline)
        || BigInt(campaign.total) + amount > goal) throw new Error("Recurring campaign funding changed. Refresh and review again.");
      return { kind: actionKind, method: "donate", args: [sc.u64(numericId), sc.addr(wallet), sc.i128(amount)] };
    }
    case "submit_proof": {
      const hash = proofHash(text(payload.hash, "proof hash")), url = publicProofUrl(text(payload.url, "proof URL"));
      const stage = campaign.stages[campaign.current_stage];
      if (campaign.config.creator !== wallet || campaign.state !== "Scheduled" || campaign.proofHash || !stage
        || now < BigInt(campaign.config.funding_deadline) || now < BigInt(stage.due_date)
        || BigInt(stage.funded) !== BigInt(stage.amount) || now >= BigInt(campaign.config.review_deadline))
        throw new Error("The current stage is no longer accepting proof.");
      return { kind: actionKind, method: "submit_proof", args: [sc.u64(numericId), campaignStruct({
        hash: sc.bytes(Buffer.from(hash, "hex")), url: sc.str(url) })] };
    }
    case "approve": {
      const hash = proofHash(text(payload.proofHash, "proof hash"));
      if (text(payload.approver, "reviewer wallet") !== wallet || !campaign.config.approvers.includes(wallet)
        || campaign.state !== "PendingProof" || campaign.proofHash !== hash || campaign.approvals.includes(wallet)
        || now >= BigInt(campaign.config.review_deadline)) throw new Error("The proof or reviewer eligibility changed.");
      return { kind: actionKind, method: "approve", args: [sc.u64(numericId), sc.addr(wallet), sc.bytes(Buffer.from(hash, "hex"))] };
    }
    case "release": {
      const stage = campaign.stages[campaign.current_stage];
      if (campaign.state !== "PendingProof" || !campaign.proofHash || campaign.approvals.length < 2 || !stage
        || BigInt(stage.funded) !== BigInt(stage.amount)) throw new Error("Two current-stage approvals are required before payout.");
      return { kind: actionKind, method: "release", args: [sc.u64(numericId)] };
    }
    case "refund": {
      const donor = text(payload.donor, "donor wallet");
      if (donor !== wallet || campaign.state !== "Refundable" || now < BigInt(campaign.config.review_deadline))
        throw new Error("A recurring refund is no longer available.");
      const raw = await readContract(contractId, "contribution", [sc.u64(numericId), sc.addr(wallet)]);
      const contribution = parseRecurringContribution(raw, campaign.stages.length);
      const amount = recurringStageRefundable(contribution, campaign.current_stage);
      if (contribution.refunded || amount <= 0n || amount.toString() !== text(payload.refundable, "refund amount")
        || !sameContribution(payload.contribution, contribution))
        throw new Error("Your unspent stage allocation changed. Refresh and review the refund again.");
      return { kind: actionKind, method: "refund", args: [sc.u64(numericId), sc.addr(wallet)] };
    }
    case "close_empty": {
      if (campaign.state !== "Refundable" || now < BigInt(campaign.config.review_deadline) || campaign.total !== "0")
        throw new Error("This recurring campaign is no longer eligible to close empty.");
      return { kind: actionKind, method: "close_empty", args: [sc.u64(numericId)] };
    }
  }
  throw new Error("The saved recurring campaign action is invalid");
}

async function submit(intentId: string, action: ConfirmationIntentAction) {
  if (isLocalPreview) return { ok: false as const, error: "Local preview cannot submit Testnet recurring transactions." };
  try {
    const intent = await consumeConfirmationIntent(intentId, action);
    const wallet = await getAuthenticatedSigner(intent.ownerId);
    if (wallet.demo || wallet.publicKey !== intent.walletAddress) throw new Error("Your signed-in wallet changed. Review the action again.");
    const contractId = await deployment();
    const operation = await validateIntent(intent.payload, wallet.publicKey, contractId);
    if (ACTIONS[operation.kind] !== action) throw new Error("This confirmation does not match the recurring action.");
    const result = await submitPreparedContractCallAs(wallet.secret, intent.transactionXdr, {
      source: wallet.publicKey, contractId, method: operation.method, args: operation.args, feeStroops: intent.feeStroops,
    });
    return result.ok ? { ok: true as const, hash: result.hash, link: txLink(result.hash), value: String(result.value ?? "") }
      : result.pending ? { ok: false as const, pending: true as const, hash: result.hash, link: txLink(result.hash), error: recurringError(result.error) }
      : { ok: false as const, error: recurringError(result.error) };
  } catch (error) { return { ok: false as const, error: recurringError(error) }; }
}

export async function recurringCampaignCreate(id: string) { return submit(id, ACTIONS.create); }
export async function recurringCampaignDonate(id: string) { return submit(id, ACTIONS.donate); }
export async function recurringCampaignSubmitProof(id: string) { return submit(id, ACTIONS.submit_proof); }
export async function recurringCampaignApprove(id: string) { return submit(id, ACTIONS.approve); }
export async function recurringCampaignRelease(id: string) { return submit(id, ACTIONS.release); }
export async function recurringCampaignRefund(id: string) { return submit(id, ACTIONS.refund); }
export async function recurringCampaignCloseEmpty(id: string) { return submit(id, ACTIONS.close_empty); }

export async function cancelRecurringCampaignConfirmation(id: string, action: string) {
  if (!Object.values(ACTIONS).includes(action as ConfirmationIntentAction)) return { ok: false as const };
  try { return { ok: await cancelConfirmationIntent(id, action as ConfirmationIntentAction) }; }
  catch { return { ok: false as const }; }
}
