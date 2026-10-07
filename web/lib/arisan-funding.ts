/** Serializable terms for the isolated, Testnet-XLM installment contract.
 * Amounts are integer stroop strings, never floats, fiat quotes or USDC. */
export type FundingCadence = "Weekly" | "Biweekly" | "Monthly";
export type FundingStatus = "Open" | "Active" | "Done" | "Dissolved";
export type FundingDrawPhase = "Commit" | "Reveal" | "Finalizable";
export const FUNDING_DAYS = [1, 3, 7, 14, 30] as const;
export type FundingDays = typeof FUNDING_DAYS[number];
export const MAX_FUNDING_SHARE_STROOPS = "10000000000000000";
export type FundingCreateReview = {
  contractId: string;
  expectedViewer: string;
  name: string;
  memberTarget: number;
  shareXlm: string;
  cadence: FundingCadence;
  fundingDays: FundingDays;
};

export type FundingJoinReview = {
  contractId: string;
  roomId: number;
  code: string;
  viewer: string;
  memberTarget: number;
  shareStroops: string;
  obligationStroops: string;
  fundingDeadline: number;
  cadence: FundingCadence;
};
export type FundingDepositReview = FundingJoinReview & {
  paidBeforeStroops: string;
  amountStroops: string;
};
export type FundingOperationReview = FundingJoinReview & { round: number };
export type FundingSeat = {
  addr: string;
  isYou: boolean;
  paidStroops: string;
  remainingStroops: string;
  fullyFunded: boolean;
  won: boolean;
  committed: boolean;
  revealed: boolean;
};
export type FundingRoom = {
  ready: true;
  contractId: string;
  id: number;
  name: string;
  status: FundingStatus;
  code: string | null;
  viewer: string | null;
  viewerIdentity: "personal" | "unverified";
  host: string;
  isHost: boolean;
  isMember: boolean;
  memberTarget: number;
  memberCount: number;
  shareStroops: string;
  obligationStroops: string;
  pooledStroops: string;
  fullyFundedCount: number;
  fundingDeadline: number;
  firstKocok: number;
  cadence: FundingCadence;
  cadenceSecs: number;
  round: number;
  seats: FundingSeat[];
  winners: { round: number; addr: string }[];
  drawPhase: FundingDrawPhase | null;
  commitAt: number;
  revealAt: number;
  commitCount: number;
  revealCount: number;
  canJoin: boolean;
  canDeposit: boolean;
  readyToStart: boolean;
  canLeave: boolean;
  canCancel: boolean;
  canCommit: boolean;
  canReveal: boolean;
  canFinalize: boolean;
};
export type FundingRoomState = FundingRoom;
export type FundingStateResult = FundingRoomState | { ready: false; error: string };
export type FundingFailure = { ok: false; error: string; pending?: false; hash?: string; link?: string; code?: string }
  | { ok: false; error: string; pending: true; hash: string; link: string; code?: string };
export type FundingMutation = { ok: true; hash: string; link: string; id?: number } | FundingFailure;

export function validFundingRoomId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 0xffff_ffff;
}

export function validFundingAmount(value: unknown, allowZero = false): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value)
    && (allowZero || value !== "0");
}

/** At most 7 decimal places. Parsing never rounds or uses Number(amount). */
export function parseFundingXlm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,7})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const stroops = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
  return stroops > 0n && stroops <= BigInt(MAX_FUNDING_SHARE_STROOPS) ? stroops.toString() : null;
}

export function formatFundingXlm(stroops: string): string {
  if (!validFundingAmount(stroops, true)) return "Unavailable";
  const amount = BigInt(stroops);
  const fraction = (amount % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${amount / 10_000_000n}${fraction ? `.${fraction}` : ""}`;
}

export function validFundingReview(value: unknown): value is FundingJoinReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Partial<FundingJoinReview>;
  if (!validFundingRoomId(input.roomId)
    || typeof input.contractId !== "string" || input.contractId.length !== 56
    || typeof input.viewer !== "string" || input.viewer.length !== 56
    || typeof input.code !== "string" || !/^[A-HJ-NP-Z2-9]{6}$/.test(input.code)
    || typeof input.memberTarget !== "number" || !Number.isInteger(input.memberTarget)
    || input.memberTarget < 3 || input.memberTarget > 20
    || (input.cadence !== "Weekly" && input.cadence !== "Biweekly" && input.cadence !== "Monthly")
    || !validFundingAmount(input.shareStroops) || !validFundingAmount(input.obligationStroops)
    || typeof input.fundingDeadline !== "number" || !Number.isSafeInteger(input.fundingDeadline)
    || input.fundingDeadline <= 0) return false;
  return BigInt(input.shareStroops) <= BigInt(MAX_FUNDING_SHARE_STROOPS)
    && BigInt(input.obligationStroops) === BigInt(input.shareStroops) * BigInt(input.memberTarget);
}

export function validFundingDepositReview(value: unknown): value is FundingDepositReview {
  if (!validFundingReview(value)) return false;
  const input = value as Partial<FundingDepositReview>;
  return validFundingAmount(input.paidBeforeStroops, true) && validFundingAmount(input.amountStroops)
    && BigInt(input.paidBeforeStroops) + BigInt(input.amountStroops) <= BigInt(input.obligationStroops!);
}

/** A review is an expectation, not authorization. The server reads every
 * field again and the contract remains the final atomic race/deadline guard. */
export function fundingReviewMatches(review: FundingJoinReview, room: {
  contractId: string; id: number; code: string | null; memberTarget: number;
  shareStroops: string; obligationStroops: string; fundingDeadline: number; cadence: FundingCadence;
}): boolean {
  return review.contractId === room.contractId && review.roomId === room.id && review.code === room.code
    && review.memberTarget === room.memberTarget && review.shareStroops === room.shareStroops
    && review.obligationStroops === room.obligationStroops && review.fundingDeadline === room.fundingDeadline
    && review.cadence === room.cadence;
}

export function fundingReview(room: FundingRoom): FundingJoinReview | null {
  if (!room.viewer || !room.code || room.viewerIdentity !== "personal") return null;
  return { contractId: room.contractId, roomId: room.id, code: room.code, viewer: room.viewer,
    memberTarget: room.memberTarget, shareStroops: room.shareStroops,
    obligationStroops: room.obligationStroops, fundingDeadline: room.fundingDeadline, cadence: room.cadence };
}
