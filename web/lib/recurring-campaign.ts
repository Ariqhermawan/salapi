import { Address, StrKey, nativeToScVal, xdr, type xdr as Xdr } from "@stellar/stellar-sdk";
import { campaignStruct, accountAddress, proofHash, publicProofUrl } from "./campaign.ts";
import { creatorCutBps } from "./campaign-money.ts";

export type RecurringState = "Funding" | "Scheduled" | "PendingProof" | "Refundable" | "Released" | "Closed";
export type RecurringStage = { amount: string; due_date: string; funded: string; released: boolean };
export type RecurringContribution = { amount: string; stages: string[]; refunded: boolean };
export type RecurringCampaign = {
  id: string; title: string; state: RecurringState;
  config: { creator: string; beneficiary: string; token: string; creator_cut_bps: number;
    funding_deadline: string; review_deadline: string; approvers: string[] };
  total: string; escrow: string; stages: RecurringStage[]; current_stage: number;
  proofHash: string | null; proofUrl: string; approvals: string[];
  contribution: RecurringContribution | null;
};

const U64_MAX = (1n << 64n) - 1n;
const I128_MAX = (1n << 127n) - 1n;
const STATES: RecurringState[] = ["Funding", "Scheduled", "PendingProof", "Refundable", "Released", "Closed"];

export function recurringCampaignNumericId(input: unknown, zero = false): bigint {
  if (typeof input !== "string" || !/^(?:0|[1-9]\d{0,19})$/.test(input)) throw new Error("Invalid recurring campaign ID");
  const id = BigInt(input);
  if ((!zero && id < 1n) || id > U64_MAX) throw new Error("Invalid recurring campaign ID");
  return id;
}

export function recurringCampaignId(input: unknown): bigint {
  if (typeof input !== "string" || !/^r[1-9]\d{0,19}$/.test(input)) throw new Error("Invalid recurring campaign ID");
  return recurringCampaignNumericId(input.slice(1));
}

function amount(value: unknown, allowZero = true): value is bigint {
  return typeof value === "bigint" && (allowZero ? value >= 0n : value > 0n) && value <= I128_MAX;
}
function time(value: unknown): value is bigint {
  return typeof value === "bigint" && value > 0n && value <= U64_MAX;
}
function publicAddress(value: unknown): value is string {
  return typeof value === "string" && StrKey.isValidEd25519PublicKey(value);
}
function enumValue(value: unknown): RecurringState | null {
  return Array.isArray(value) && value.length === 1 && STATES.includes(value[0] as RecurringState)
    ? value[0] as RecurringState : null;
}

/** Strictly project Soroban values before they reach a user-facing page. */
export function parseRecurringCampaign(value: unknown, contributionValue?: unknown): RecurringCampaign {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Recurring campaign data is unavailable");
  const c = value as Record<string, unknown>;
  const config = c.config as Record<string, unknown> | null;
  const state = enumValue(c.state);
  const stages = c.stages;
  const approvals = c.approvals;
  const proof = c.proof_hash;
  if (typeof c.id !== "bigint" || c.id < 1n || c.id > U64_MAX || typeof c.title !== "string"
    || !c.title.trim() || new TextEncoder().encode(c.title).length > 120 || !state
    || !amount(c.total) || !amount(c.escrow) || c.escrow > c.total || !Number.isInteger(c.current_stage)
    || (c.current_stage as number) < 0 || !config || !publicAddress(config.creator) || !publicAddress(config.beneficiary)
    || typeof config.token !== "string" || !StrKey.isValidContract(config.token)
    || !Number.isInteger(config.creator_cut_bps) || (config.creator_cut_bps as number) < 0
    || (config.creator_cut_bps as number) > 1000 || !time(config.funding_deadline) || !time(config.review_deadline)
    || config.review_deadline <= config.funding_deadline || !Array.isArray(config.approvers) || config.approvers.length !== 3
    || !config.approvers.every(publicAddress) || new Set(config.approvers).size !== 3 || !Array.isArray(stages)
    || stages.length < 2 || stages.length > 6 || !Array.isArray(approvals) || approvals.length > 3
    || !approvals.every(publicAddress) || approvals.some(a => !(config.approvers as string[]).includes(a)) || new Set(approvals).size !== approvals.length
    || !(proof === null || proof instanceof Uint8Array && proof.length === 32) || typeof c.proof_url !== "string")
    throw new Error("Recurring campaign data is unavailable");

  let goal = 0n;
  let funded = 0n;
  let previousDue = 0n;
  const serializedStages: RecurringStage[] = stages.map((stageValue: unknown, index: number) => {
    if (!stageValue || typeof stageValue !== "object" || Array.isArray(stageValue)) throw new Error("Recurring campaign data is unavailable");
    const stage = stageValue as Record<string, unknown>;
    if (!amount(stage.amount, false) || !time(stage.due_date) || stage.due_date < (config.funding_deadline as bigint)
    || stage.due_date >= (config.review_deadline as bigint) || stage.due_date <= previousDue || !amount(stage.funded)
      || stage.funded > stage.amount || typeof stage.released !== "boolean"
      || stage.released !== (index < (c.current_stage as number))) throw new Error("Recurring campaign data is unavailable");
    previousDue = stage.due_date;
    goal += stage.amount;
    funded += stage.funded;
    return { amount: stage.amount.toString(), due_date: stage.due_date.toString(), funded: stage.funded.toString(), released: stage.released };
  });
  if (goal > I128_MAX || funded !== c.total || (c.current_stage as number) > serializedStages.length
    || state === "Released" && ((c.current_stage as number) !== serializedStages.length || c.escrow !== 0n)
    || state === "Closed" && c.escrow !== 0n)
    throw new Error("Recurring campaign data is unavailable");
  const contribution = contributionValue === undefined || contributionValue === null ? null : parseRecurringContribution(contributionValue, serializedStages.length);
  const proofUrl = c.proof_url === "" ? "" : publicProofUrl(c.proof_url);
  return { id: c.id.toString(), title: c.title, state,
    config: { creator: config.creator, beneficiary: config.beneficiary, token: config.token,
      creator_cut_bps: config.creator_cut_bps as number, funding_deadline: config.funding_deadline.toString(),
      review_deadline: config.review_deadline.toString(), approvers: [...config.approvers] as string[] },
    total: c.total.toString(), escrow: c.escrow.toString(), stages: serializedStages, current_stage: c.current_stage as number,
    proofHash: proof ? Buffer.from(proof).toString("hex") : null, proofUrl, approvals: [...approvals] as string[], contribution };
}

export function parseRecurringContribution(value: unknown, stageCount: number): RecurringContribution {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Recurring contribution data is unavailable");
  const c = value as Record<string, unknown>;
  if (!amount(c.amount) || typeof c.refunded !== "boolean" || !Array.isArray(c.stages)
    || c.stages.length !== stageCount || !c.stages.every(item => amount(item)))
    throw new Error("Recurring contribution data is unavailable");
  const stages = c.stages as bigint[];
  if (stages.reduce((total, item) => total + item, 0n) !== c.amount) throw new Error("Recurring contribution data is unavailable");
  return { amount: c.amount.toString(), stages: stages.map(item => item.toString()), refunded: c.refunded };
}

export function parseRecurringCreateInput(input: unknown, now: bigint) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid recurring campaign terms");
  const v = input as Record<string, unknown>;
  const title = typeof v.title === "string" ? v.title.trim() : "";
  if (!title || new TextEncoder().encode(title).length > 120) throw new Error("Title must be 1–120 UTF-8 bytes");
  const beneficiary = accountAddress(v.beneficiary);
  if (!Array.isArray(v.approvers) || v.approvers.length !== 3) throw new Error("Choose exactly three approver wallets");
  const approvers = v.approvers.map(accountAddress);
  if (new Set(approvers).size !== 3) throw new Error("Approver wallets must be distinct");
  const funding = recurringCampaignNumericId(v.fundingDeadline);
  const review = recurringCampaignNumericId(v.reviewDeadline);
  if (funding <= now || review <= funding) throw new Error("Funding must end in the future; review must end after funding");
  if (!Array.isArray(v.stages) || v.stages.length < 2 || v.stages.length > 6) throw new Error("Choose two to six payout stages");
  const stages = v.stages.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid payout stage");
    const stage = value as Record<string, unknown>;
    if (typeof stage.amountStroops !== "string" || !/^[1-9]\d{0,37}$/.test(stage.amountStroops)) throw new Error("Each stage needs a positive XLM target");
    const stageAmount = BigInt(stage.amountStroops);
    if (stageAmount > I128_MAX) throw new Error("Stage target is too large");
    const dueDate = recurringCampaignNumericId(stage.dueDate);
    return { amount: stageAmount, due_date: dueDate };
  });
  let total = 0n;
  let previous = 0n;
  for (const stage of stages) {
    total += stage.amount;
    if (total > I128_MAX || stage.due_date < funding || stage.due_date >= review || stage.due_date <= previous)
      throw new Error("Stage dates must be ordered, on or after funding close, and before final review");
    previous = stage.due_date;
  }
  return { title, beneficiary, approvers, funding, review, cutBps: creatorCutBps(v.creatorCut), stages };
}

export function recurringStageArgs(terms: { amount: bigint; due_date: bigint }[]): Xdr.ScVal {
  return xdr.ScVal.scvVec(terms.map(term => campaignStruct({
    amount: nativeToScVal(term.amount, { type: "i128" }), due_date: nativeToScVal(term.due_date, { type: "u64" }),
  })));
}

export function recurringConfigArgs(config: { creator: string; beneficiary: string; token: string; creatorCutBps: number;
  fundingDeadline: bigint; reviewDeadline: bigint; approvers: string[] }): Xdr.ScVal {
  return campaignStruct({ creator: new Address(config.creator).toScVal(), beneficiary: new Address(config.beneficiary).toScVal(),
    token: new Address(config.token).toScVal(), creator_cut_bps: nativeToScVal(config.creatorCutBps, { type: "u32" }),
    funding_deadline: nativeToScVal(config.fundingDeadline, { type: "u64" }), review_deadline: nativeToScVal(config.reviewDeadline, { type: "u64" }),
    approvers: config.approvers.map(value => new Address(value).toScVal()) });
}

export function recurringStageRefundable(contribution: RecurringContribution, currentStage: number): bigint {
  if (!Number.isInteger(currentStage) || currentStage < 0 || currentStage > contribution.stages.length)
    throw new Error("Recurring stage state is invalid");
  return contribution.stages.slice(currentStage).reduce((total, value) => total + BigInt(value), 0n);
}

export function parseXlmStroops(input: string): bigint {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,7})?$/.test(value)) throw new Error("Enter an XLM amount with up to seven decimal places");
  const [whole, fraction = ""] = value.split(".");
  const parsed = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0") || "0");
  if (parsed <= 0n || parsed > I128_MAX) throw new Error("Enter a positive XLM amount");
  return parsed;
}

export { proofHash, publicProofUrl };
