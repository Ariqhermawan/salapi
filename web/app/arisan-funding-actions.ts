"use server";

import { StrKey } from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";
import { arisanRoomsId, CONTRACTS, invokeAs, readContract, sc, txLink, type TxResult } from "@/lib/server/stellar";
import { authenticatedArisanWallet } from "@/lib/server/arisanAuthorization";
import { getAuthenticatedSigner, type Signer } from "@/lib/server/userWallet";
import { createArisanCommitment, deriveArisanSecret } from "@/lib/server/arisanCommitment";
import { readArisanFundingReceipt, verifyArisanFundingCreateReceipt } from "@/lib/server/arisanFundingReceipt";
import { isLocalPreview } from "@/lib/local-preview";
import { arisanRoomPage } from "@/lib/arisan-list";
import {
  FUNDING_DAYS, MAX_FUNDING_SHARE_STROOPS, fundingReview, fundingReviewMatches,
  parseFundingXlm, validFundingAmount, validFundingDepositReview, validFundingReview, validFundingRoomId,
  type FundingCadence, type FundingCreateReview, type FundingDepositReview, type FundingDrawPhase,
  type FundingFailure, type FundingJoinReview, type FundingMutation, type FundingOperationReview, type FundingRoom,
  type FundingStateResult, type FundingStatus,
} from "@/lib/arisan-funding";

const UNAVAILABLE = "Installment Arisan is unavailable. No new operation was confirmed.";
const REVIEW_CHANGED = "The room, account or payment changed. Reload and review the exact terms again.";
const CODE_ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** No fallback to the legacy deployment, even if the candidate is unset. */
function contractId(): string | null {
  const id = process.env.ARISAN_INSTALLMENTS_CONTRACT?.trim();
  return id && StrKey.isValidContract(id) && id !== arisanRoomsId()?.trim() ? id : null;
}
function failure(error = UNAVAILABLE): FundingFailure { return { ok: false, error }; }
function unavailable(): { ready: false; error: string } { return { ready: false, error: UNAVAILABLE }; }
function tag(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0]
    : raw && typeof raw === "object" && "tag" in raw ? (raw as { tag: unknown }).tag : raw;
}
function integer(raw: unknown, min = 0, max = 0xffff_ffff): number {
  if (typeof raw !== "number" && typeof raw !== "bigint") throw new Error("Invalid contract integer");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("Invalid contract integer");
  return value;
}
function amount(raw: unknown): string {
  if (typeof raw !== "bigint" && !(typeof raw === "number" && Number.isSafeInteger(raw)))
    throw new Error("Invalid contract amount");
  const value = String(raw);
  if (!validFundingAmount(value, true)) throw new Error("Invalid contract amount");
  return value;
}
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid contract state");
  return raw as Record<string, unknown>;
}
function validAddress(raw: unknown): raw is string {
  return typeof raw === "string" && StrKey.isValidEd25519PublicKey(raw);
}

/** Capability and native asset checked before signer access. A valid address
 * alone is not evidence that the installed contract is the candidate. */
type ContractInfo = { cadenceSecs: Record<FundingCadence, number>; firstCommitWindow: number;
  maxPostponeSeconds: number; maxFundingWindow: number };
async function checkContract(id: string): Promise<ContractInfo> {
  const info = record(await readContract(id, "installment_contract_info"));
  if (integer(info.version, 1, 1) !== 1 || info.token !== CONTRACTS.tokenXlmSac)
    throw new Error("Unsupported installment contract");
  return { cadenceSecs: { Weekly: integer(info.cadence_weekly, 1, 86400 * 365),
    Biweekly: integer(info.cadence_biweekly, 1, 86400 * 365), Monthly: integer(info.cadence_monthly, 1, 86400 * 365) },
    firstCommitWindow: integer(info.first_commit_window, 1, 86400 * 365),
    maxPostponeSeconds: integer(info.max_postpone, 1, 86400 * 30),
    maxFundingWindow: integer(info.max_funding_window, 86400, 86400 * 365) };
}

type Core = {
  contractId: string; id: number; host: string; name: string; code: string;
  memberTarget: number; memberCount: number; shareStroops: string; obligationStroops: string;
  cadence: FundingCadence; fundingDeadline: number; firstKocok: number;
  status: FundingStatus; round: number; pooledStroops: string; fullyFundedCount: number;
  members: string[]; paid: Map<string, string>;
};
class LegacyFundingRoom extends Error {}
async function readCore(id: string, roomId: number): Promise<Core> {
  const [rawRoom, rawFunding, rawMembers] = await Promise.all([
    readContract(id, "get_room", [sc.u32(roomId)]),
    readContract(id, "funding_state", [sc.u32(roomId)]),
    readContract(id, "get_members", [sc.u32(roomId)]),
  ]);
  const room = record(rawRoom), funding = record(rawFunding);
  if (tag(funding.mode) === "LegacyFull") throw new LegacyFundingRoom("This room uses the legacy full-prefund mode.");
  if (tag(funding.mode) !== "Installments") throw new Error("Not an installment room");
  const memberTarget = integer(room.member_target, 3, 20), memberCount = integer(room.member_count, 0, 20);
  if (!Array.isArray(rawMembers) || rawMembers.length !== memberCount || rawMembers.some(value => !validAddress(value))
    || new Set(rawMembers).size !== rawMembers.length || memberCount > memberTarget)
    throw new Error("Invalid membership");
  const members = rawMembers as string[];
  const shareStroops = amount(room.share), obligationStroops = amount(funding.obligation);
  if (BigInt(shareStroops) <= 0n || BigInt(shareStroops) > BigInt(MAX_FUNDING_SHARE_STROOPS)
    || BigInt(obligationStroops) !== BigInt(shareStroops) * BigInt(memberTarget)) throw new Error("Invalid obligation");
  const status = tag(room.status), cadence = tag(room.cadence);
  if (status !== "Open" && status !== "Active" && status !== "Done" && status !== "Dissolved") throw new Error("Invalid status");
  if (cadence !== "Weekly" && cadence !== "Biweekly" && cadence !== "Monthly") throw new Error("Invalid cadence");
  if (!validAddress(room.host) || typeof room.name !== "string" || room.name.length > 160
    || typeof room.code !== "string" || !/^[A-HJ-NP-Z2-9]{6}$/.test(room.code)) throw new Error("Invalid terms");
  if (status !== "Dissolved" && !members.includes(room.host)) throw new Error("Host seat is unavailable");
  const fundingDeadline = integer(funding.deadline, 1, Number.MAX_SAFE_INTEGER);
  if (integer(room.join_deadline, 1, Number.MAX_SAFE_INTEGER) !== fundingDeadline) throw new Error("Deadline mismatch");
  const firstKocok = integer(room.first_kocok, 0, Number.MAX_SAFE_INTEGER), round = integer(room.round, 0, 21);
  if (status === "Open" && (firstKocok !== 0 || round !== 0)) throw new Error("Invalid open room");
  if (status === "Active" && (firstKocok === 0 || round < 1 || round > memberTarget)) throw new Error("Invalid active room");
  const fullyFundedCount = integer(funding.fully_funded_count, 0, memberCount), pooledStroops = amount(funding.pooled);
  const paidRows = await Promise.all(members.map(async member => [member,
    amount(await readContract(id, "locked_of", [sc.u32(roomId), sc.addr(member)]))] as const));
  if (paidRows.some(([, paid]) => BigInt(paid) > BigInt(obligationStroops))) throw new Error("Invalid contribution");
  // Independent reads may straddle a ledger. A contradictory read is retryable,
  // never used to authorize a transfer or pretend everyone is funded.
  if (status === "Open" && (paidRows.filter(([, paid]) => paid === obligationStroops).length !== fullyFundedCount
    || paidRows.reduce((total, [, paid]) => total + BigInt(paid), 0n) !== BigInt(pooledStroops))) throw new Error("Funding changed during read");
  return { contractId: id, id: roomId, host: room.host, name: room.name, code: room.code,
    memberTarget, memberCount, shareStroops, obligationStroops, cadence, fundingDeadline,
    firstKocok, status, round, pooledStroops, fullyFundedCount, members, paid: new Map(paidRows) };
}

function txResult(result: TxResult): FundingMutation {
  if (result.ok) return { ok: true, hash: result.hash, link: txLink(result.hash) };
  return result.pending
    ? { ok: false, pending: true, hash: result.hash, link: txLink(result.hash),
      error: "Transaction confirmation is pending. Check the original transaction before retrying." }
    : { ok: false, error: "The operation was not confirmed. Reload the room before trying again.",
      ...(result.hash ? { hash: result.hash, link: txLink(result.hash) } : {}) };
}

async function savedSigner(expectedViewer: string): Promise<{ ok: true; signer: Signer } | FundingFailure> {
  const owner = await authenticatedArisanWallet();
  if (!owner.ok) return owner;
  if (owner.publicKey !== expectedViewer) return failure(REVIEW_CHANGED);
  try {
    const signer = await getAuthenticatedSigner();
    if (signer.demo !== false || signer.publicKey !== owner.publicKey) return failure(REVIEW_CHANGED);
    return { ok: true, signer };
  } catch { return failure("Your saved wallet is unavailable. No transaction was submitted."); }
}

async function roomDto(core: Core, viewer: string | null, info: ContractInfo, showInvite = false): Promise<FundingRoom> {
  const isMember = viewer !== null && core.members.includes(viewer), isHost = viewer === core.host;
  const now = Math.floor(Date.now() / 1000), open = core.status === "Open", beforeDeadline = now < core.fundingDeadline;
  let drawPhase: FundingDrawPhase | null = null, commitAt = core.firstKocok, revealAt = core.firstKocok, commitCount = 0, revealCount = 0;
  if (core.status === "Active") {
    const [phase, commit, reveal, committed, revealed] = await Promise.all([
      readContract(core.contractId, "draw_phase", [sc.u32(core.id)]),
      readContract(core.contractId, "kocok_at", [sc.u32(core.id), sc.u32(core.round)]),
      readContract(core.contractId, "reveal_at", [sc.u32(core.id), sc.u32(core.round)]),
      readContract(core.contractId, "commit_count", [sc.u32(core.id), sc.u32(core.round)]),
      readContract(core.contractId, "reveal_count", [sc.u32(core.id), sc.u32(core.round)]),
    ]);
    const value = tag(phase);
    if (value !== "Commit" && value !== "Reveal" && value !== "Finalizable") throw new Error("Invalid phase");
    drawPhase = value;
    commitAt = integer(commit, 1, Number.MAX_SAFE_INTEGER); revealAt = integer(reveal, commitAt, Number.MAX_SAFE_INTEGER);
    commitCount = integer(committed, 0, core.memberTarget); revealCount = integer(revealed, 0, commitCount);
  }
  const seats = await Promise.all(core.members.map(async addr => {
    const [won, committed, revealed] = core.status === "Active" ? await Promise.all([
      readContract(core.contractId, "has_won", [sc.u32(core.id), sc.addr(addr)]),
      readContract(core.contractId, "has_committed", [sc.u32(core.id), sc.u32(core.round), sc.addr(addr)]),
      readContract(core.contractId, "has_revealed", [sc.u32(core.id), sc.u32(core.round), sc.addr(addr)]),
    ]) : [core.status === "Done" ? await readContract(core.contractId, "has_won", [sc.u32(core.id), sc.addr(addr)]) : false, false, false];
    if ([won, committed, revealed].some(value => typeof value !== "boolean")) throw new Error("Invalid draw membership");
    const paid = core.paid.get(addr)!;
    return { addr, isYou: addr === viewer, paidStroops: paid,
      remainingStroops: (BigInt(core.obligationStroops) - BigInt(paid)).toString(),
      fullyFunded: paid === core.obligationStroops, won: won as boolean, committed: committed as boolean, revealed: revealed as boolean };
  }));
  const winners = await Promise.all(Array.from({ length: Math.max(0, core.round - 1) }, async (_, index) => {
    const round = index + 1;
    const addr = await readContract(core.contractId, "winner_of", [sc.u32(core.id), sc.u32(round)]);
    if (!validAddress(addr)) throw new Error("Invalid payout winner");
    return { round, addr };
  }));
  const mySeat = seats.find(seat => seat.isYou);
  return { ready: true, contractId: core.contractId, id: core.id, name: core.name, status: core.status,
    code: isMember || showInvite ? core.code : null, viewer, viewerIdentity: viewer ? "personal" : "unverified",
    host: core.host, isHost, isMember, memberTarget: core.memberTarget, memberCount: core.memberCount,
    shareStroops: core.shareStroops, obligationStroops: core.obligationStroops,
    pooledStroops: core.pooledStroops, fullyFundedCount: core.fullyFundedCount,
    fundingDeadline: core.fundingDeadline, firstKocok: core.firstKocok, cadence: core.cadence,
    cadenceSecs: info.cadenceSecs[core.cadence], round: core.round, seats, winners,
    drawPhase, commitAt, revealAt, commitCount, revealCount,
    canJoin: !!viewer && !isMember && open && beforeDeadline && core.memberCount < core.memberTarget,
    canDeposit: isMember && open && beforeDeadline && !!mySeat && !mySeat.fullyFunded,
    readyToStart: isHost && open && beforeDeadline && core.memberCount === core.memberTarget
      && core.fullyFundedCount === core.memberTarget && BigInt(core.pooledStroops) === BigInt(core.obligationStroops) * BigInt(core.memberTarget),
    canLeave: isMember && !isHost && open,
    canCancel: open && (isHost || (isMember && !beforeDeadline)),
    canCommit: isMember && drawPhase === "Commit" && !!mySeat && !mySeat.won && !mySeat.committed,
    canReveal: isMember && drawPhase === "Reveal" && !!mySeat?.committed && !mySeat.revealed,
    canFinalize: isMember && drawPhase === "Finalizable" };
}

export async function fundingState(roomId: number): Promise<FundingStateResult> {
  const id = contractId();
  if (isLocalPreview || !id || !validFundingRoomId(roomId)) return unavailable();
  try {
    const [owner, info] = await Promise.all([authenticatedArisanWallet(), checkContract(id)]);
    return await roomDto(await readCore(id, roomId), owner.ok ? owner.publicKey : null, info);
  } catch { return unavailable(); }
}

export async function fundingList(cursor?: number): Promise<{ ready: true; contractId: string; viewer: string | null;
  cadenceSecs: Record<FundingCadence, number>; firstCommitWindow: number;
  total: number; rooms: FundingRoom[]; nextCursor: number | null } | { ready: false; error: string }> {
  const id = contractId();
  if (isLocalPreview || !id) return unavailable();
  try {
    const [owner, info] = await Promise.all([authenticatedArisanWallet(), checkContract(id)]);
    const count = integer(await readContract(id, "room_count"));
    const page = arisanRoomPage(count, cursor, 10);
    // Bound concurrency and page size. The cursor only advances after every
    // room in this page has been read successfully.
    const rooms: FundingRoom[] = [];
    for (let offset = 0; offset < page.ids.length; offset += 3) {
      const batch = await Promise.all(page.ids.slice(offset, offset + 3).map(async roomId => {
        try {
          const core = await readCore(id, roomId);
          return owner.ok && core.members.includes(owner.publicKey) ? roomDto(core, owner.publicKey, info) : null;
        } catch (error) {
          // The candidate retains the legacy ABI intentionally. Only a
          // positively identified legacy mode is skipped; unknown mode or
          // transport failure must not advance past an unreadable page.
          if (error instanceof LegacyFundingRoom) return null;
          throw error;
        }
      }));
      rooms.push(...batch.filter((room): room is FundingRoom => room !== null));
    }
    return { ready: true, contractId: id, viewer: owner.ok ? owner.publicKey : null,
      cadenceSecs: info.cadenceSecs, firstCommitWindow: info.firstCommitWindow,
      total: count, rooms, nextCursor: page.nextCursor };
  } catch { return unavailable(); }
}

export async function fundingResolveCode(rawCode: string): Promise<{ ok: true; id: number; code: string;
  room: FundingRoom; review: FundingJoinReview | null } | FundingFailure> {
  const id = contractId();
  if (isLocalPreview || !id) return failure();
  if (typeof rawCode !== "string" || !/^[A-HJ-NP-Z2-9]{6}$/.test(rawCode.trim().toUpperCase()))
    return failure("Enter the 6-character installment room code.");
  const code = rawCode.trim().toUpperCase();
  try {
    const [owner, info] = await Promise.all([authenticatedArisanWallet(), checkContract(id)]);
    const roomId = integer(await readContract(id, "room_by_code", [sc.sym(code)]), 1);
    const core = await readCore(id, roomId);
    if (core.code !== code) return failure(REVIEW_CHANGED);
    const room = await roomDto(core, owner.ok ? owner.publicKey : null, info, true);
    return { ok: true, id: roomId, code, room, review: fundingReview(room) };
  } catch { return failure("This installment invitation could not be loaded. Check the code or retry."); }
}

export async function fundingCreate(input: FundingCreateReview): Promise<({ ok: true; id: number; code: string; hash: string; link: string }) | FundingFailure> {
  const id = contractId();
  if (isLocalPreview || !id) return failure();
  if (!input || typeof input !== "object" || typeof input.name !== "string"
    || input.contractId !== id || !validAddress(input.expectedViewer)
    || input.name.trim().length < 1 || Buffer.byteLength(input.name.trim(), "utf8") > 80
    || !Number.isInteger(input.memberTarget) || input.memberTarget < 3 || input.memberTarget > 20
    || !FUNDING_DAYS.includes(input.fundingDays)
    || !["Weekly", "Biweekly", "Monthly"].includes(input.cadence)) return failure("Review valid room terms before creating.");
  const share = parseFundingXlm(input.shareXlm);
  if (!share) return failure("Enter a positive Testnet XLM share with at most 7 decimal places.");
  const owner = await authenticatedArisanWallet();
  if (!owner.ok) return owner;
  if (owner.publicKey !== input.expectedViewer) return failure(REVIEW_CHANGED);
  try {
    const info = await checkContract(id);
    if (input.fundingDays * 86400 > info.maxFundingWindow) return failure("The contract does not support this funding window.");
    const resolved = await savedSigner(input.expectedViewer);
    if (!resolved.ok) return resolved;
    const code = [...randomBytes(6)].map(byte => CODE_ALPHA[byte & 31]).join("");
    const deadline = Math.floor(Date.now() / 1000) + input.fundingDays * 86400;
    const result = await invokeAs(resolved.signer.secret, id, "create_installment_room", [sc.addr(owner.publicKey),
      sc.sym(code), sc.str(input.name.trim()), sc.u32(input.memberTarget), sc.i128(BigInt(share)),
      sc.unitVariant(input.cadence), sc.u64(deadline)]);
    if (!result.ok) return { ...txResult(result), code } as FundingFailure;
    let roomId: number;
    try { roomId = integer(result.value, 1); }
    catch {
      try {
        const recoveredId = integer(await readContract(id, "room_by_code", [sc.sym(code)]), 1);
        const core = await readCore(id, recoveredId);
        if (core.host !== owner.publicKey || core.code !== code || core.name !== input.name.trim()
          || core.memberTarget !== input.memberTarget || core.shareStroops !== share
          || core.cadence !== input.cadence || core.fundingDeadline !== deadline) throw new Error("Created room could not be verified");
        roomId = recoveredId;
      } catch {
        return { ok: false, pending: true, hash: result.hash, link: txLink(result.hash), code,
          error: `The transaction is confirmed, but verifying the new room is pending. Do not create it again. Resolve invite ${code} or check the original receipt.` };
      }
    }
    return { ok: true, id: roomId, code, hash: result.hash, link: txLink(result.hash) };
  } catch { return failure(); }
}

/** Independently recover a submitted create from its original committed
 * envelope. A successful status alone never unlocks another create attempt. */
export async function fundingRecoverCreate(hash: string): Promise<({ ok: true; id: number; code: string; hash: string; link: string }) | FundingFailure> {
  const id = contractId();
  if (isLocalPreview || !id) return failure();
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return failure("Invalid original transaction hash.");
  const owner = await authenticatedArisanWallet();
  if (!owner.ok) return owner;
  const unresolved = (error: string): FundingFailure => ({ ok: false, pending: true, hash, link: txLink(hash), error });
  try {
    await checkContract(id);
    const response = await readArisanFundingReceipt(hash);
    const receipt = verifyArisanFundingCreateReceipt(response, hash, id, owner.publicKey);
    if (!receipt) return unresolved("The original create receipt is not confirmed or does not match this account and contract. Do not create another room.");
    const roomId = integer(await readContract(id, "room_by_code", [sc.sym(receipt.code)]), 1);
    const core = await readCore(id, roomId);
    if (core.host !== receipt.host || core.code !== receipt.code || core.name !== receipt.name
      || core.memberTarget !== receipt.memberTarget || core.shareStroops !== receipt.shareStroops
      || core.cadence !== receipt.cadence || core.fundingDeadline !== receipt.fundingDeadline)
      return unresolved("The original room's immutable terms could not be verified. Retry recovery only, not creation.");
    const currentOwner = await authenticatedArisanWallet();
    if (!currentOwner.ok || currentOwner.publicKey !== owner.publicKey) return unresolved(REVIEW_CHANGED);
    return { ok: true, id: roomId, code: receipt.code, hash, link: txLink(hash) };
  } catch { return unresolved("Reading the original room is unavailable. Retry recovery only. No new transaction was submitted."); }
}

async function checkedReview(id: string, review: FundingJoinReview, purpose: "join" | "deposit"): Promise<Core | FundingFailure> {
  const resolvedId = integer(await readContract(id, "room_by_code", [sc.sym(review.code)]), 1);
  if (resolvedId !== review.roomId) return failure(REVIEW_CHANGED);
  const core = await readCore(id, review.roomId);
  if (!fundingReviewMatches(review, core)) return failure(REVIEW_CHANGED);
  if (core.status !== "Open") return failure("This room is no longer collecting deposits.");
  if (Math.floor(Date.now() / 1000) >= core.fundingDeadline) return failure("The funding deadline has passed. No deposit was submitted.");
  const member = core.members.includes(review.viewer);
  if (purpose === "join" && (member || core.memberCount >= core.memberTarget)) return failure("You already joined or this room is full.");
  if (purpose === "deposit") {
    const deposit = review as FundingDepositReview;
    if (!member || core.paid.get(review.viewer) !== deposit.paidBeforeStroops
      || BigInt(deposit.amountStroops) > BigInt(core.obligationStroops) - BigInt(core.paid.get(review.viewer)!)) return failure(REVIEW_CHANGED);
  }
  return core;
}

async function reviewedMutation(review: FundingJoinReview, purpose: "join" | "deposit"): Promise<FundingMutation> {
  const id = contractId();
  if (isLocalPreview || !id) return failure();
  if (!(purpose === "join" ? validFundingReview(review) : validFundingDepositReview(review))
    || review.contractId !== id || !validAddress(review.viewer)) return failure(REVIEW_CHANGED);
  const owner = await authenticatedArisanWallet();
  if (!owner.ok) return owner;
  if (owner.publicKey !== review.viewer) return failure(REVIEW_CHANGED);
  try {
    await checkContract(id);
    const first = await checkedReview(id, review, purpose);
    if ("ok" in first) return first;
    const resolved = await savedSigner(review.viewer);
    if (!resolved.ok) return resolved;
    const current = await checkedReview(id, review, purpose);
    if ("ok" in current) return current;
    const result = txResult(await invokeAs(resolved.signer.secret, id, purpose === "join" ? "join_room" : "deposit_room",
      purpose === "join" ? [sc.u32(review.roomId), sc.sym(review.code), sc.addr(review.viewer)]
        : [sc.u32(review.roomId), sc.addr(review.viewer), sc.i128(BigInt((review as FundingDepositReview).amountStroops))]));
    return result.ok && purpose === "join" ? { ...result, id: review.roomId } : result;
  } catch { return failure(); }
}
export async function fundingJoin(review: FundingJoinReview): Promise<FundingMutation> { return reviewedMutation(review, "join"); }
export async function fundingDeposit(review: FundingDepositReview): Promise<FundingMutation> { return reviewedMutation(review, "deposit"); }

type RoomOperation = "start" | "leave" | "cancel" | "commit" | "reveal" | "finalize" | "postpone";
function operationError(core: Core, viewer: string, operation: RoomOperation, now: number): string | null {
  const member = core.members.includes(viewer), host = core.host === viewer;
  if (operation === "start") {
    if (!host) return "Only the host can start this room.";
    if (core.status !== "Open" || now >= core.fundingDeadline) return "This room can no longer start. Review cancellation and refunds.";
    if (core.memberCount !== core.memberTarget || core.fullyFundedCount !== core.memberTarget
      || BigInt(core.pooledStroops) !== BigInt(core.obligationStroops) * BigInt(core.memberTarget)) return "Every seat must be joined and fully funded before Start.";
  } else if (operation === "leave") {
    if (!member || host || core.status !== "Open") return "Only a non-host member may leave before Start.";
  } else if (operation === "cancel") {
    if (core.status !== "Open" || !(host || (member && now >= core.fundingDeadline))) return "Only the host, or a member after the deadline, can cancel an unstarted room.";
  } else if (!member || core.status !== "Active" || (operation === "postpone" && !host)) {
    return "This control requires the correct member and active room.";
  }
  return null;
}
async function drawOperationError(core: Core, viewer: string, operation: RoomOperation): Promise<string | null> {
  if (operation !== "commit" && operation !== "reveal" && operation !== "finalize" && operation !== "postpone") return null;
  const phase = tag(await readContract(core.contractId, "draw_phase", [sc.u32(core.id)]));
  const expected = operation === "finalize" ? "Finalizable" : operation === "reveal" ? "Reveal" : "Commit";
  if (phase !== expected) return "This round's window changed. Reload the room.";
  if (operation === "finalize") return null;
  if (operation === "postpone") {
    const count = integer(await readContract(core.contractId, "commit_count", [sc.u32(core.id), sc.u32(core.round)]), 0, core.memberTarget);
    return count > 0 ? "The round cannot be postponed after a commitment." : null;
  }
  const [won, committed, revealed] = await Promise.all([
    readContract(core.contractId, "has_won", [sc.u32(core.id), sc.addr(viewer)]),
    readContract(core.contractId, "has_committed", [sc.u32(core.id), sc.u32(core.round), sc.addr(viewer)]),
    readContract(core.contractId, "has_revealed", [sc.u32(core.id), sc.u32(core.round), sc.addr(viewer)]),
  ]);
  if ([won, committed, revealed].some(value => typeof value !== "boolean")) throw new Error("Invalid participation");
  if (won) return "This member has already received their payout and cannot enter another draw.";
  if (operation === "commit" && committed) return "You already committed in this round.";
  if (operation === "reveal" && (!committed || revealed)) return "Reveal requires your original, unrevealed commitment.";
  return null;
}
async function roomMutation(review: FundingOperationReview, operation: RoomOperation, delaySeconds?: number): Promise<FundingMutation> {
  const id = contractId();
  if (isLocalPreview || !id) return failure();
  if (!validFundingReview(review) || review.contractId !== id || !validAddress(review.viewer)
    || !Number.isSafeInteger(review.round) || review.round < 0 || review.round > 21
    || (operation === "postpone" && (!Number.isSafeInteger(delaySeconds)
    || delaySeconds! <= 0 || delaySeconds! > 86400 * 30))) return failure("Invalid room operation.");
  const owner = await authenticatedArisanWallet();
  if (!owner.ok) return owner;
  if (owner.publicKey !== review.viewer) return failure(REVIEW_CHANGED);
  const roomId = review.roomId;
  try {
    const info = await checkContract(id);
    if (operation === "postpone" && delaySeconds! > info.maxPostponeSeconds) return failure("The delay exceeds this contract's postponement limit.");
    const before = await readCore(id, roomId);
    if (!fundingReviewMatches(review, before) || before.round !== review.round) return failure(REVIEW_CHANGED);
    const denied = operationError(before, owner.publicKey, operation, Math.floor(Date.now() / 1000));
    if (denied) return failure(denied);
    const drawDenied = await drawOperationError(before, owner.publicKey, operation);
    if (drawDenied) return failure(drawDenied);
    const resolved = await savedSigner(owner.publicKey);
    if (!resolved.ok) return resolved;
    const current = await readCore(id, roomId);
    if (!fundingReviewMatches(review, current) || current.round !== review.round) return failure(REVIEW_CHANGED);
    const changed = operationError(current, owner.publicKey, operation, Math.floor(Date.now() / 1000));
    if (changed || current.round !== before.round) return failure(changed ?? REVIEW_CHANGED);
    const drawChanged = await drawOperationError(current, owner.publicKey, operation);
    if (drawChanged) return failure(drawChanged);
    const signer = resolved.signer;
    const args = [sc.u32(roomId), sc.addr(signer.publicKey)];
    const method: Record<RoomOperation, string> = { start: "start_room", leave: "leave_room", cancel: "cancel_room",
      commit: "commit_draw", reveal: "reveal_draw", finalize: "finalize_draw", postpone: "postpone_kocok" };
    if (operation === "commit" || operation === "reveal") {
      const secret = deriveArisanSecret({ signingSecret: signer.secret, contractId: id, roomId,
        round: current.round, participant: signer.publicKey });
      args.push(sc.bytes(operation === "commit" ? createArisanCommitment({ contractId: id, roomId,
        round: current.round, participant: signer.publicKey, secret }) : secret));
    }
    if (operation === "postpone") args.push(sc.u64(delaySeconds!));
    return txResult(await invokeAs(signer.secret, id, method[operation], args));
  } catch { return failure(); }
}
export async function fundingStart(review: FundingOperationReview): Promise<FundingMutation> { return roomMutation(review, "start"); }
export async function fundingLeave(review: FundingOperationReview): Promise<FundingMutation> { return roomMutation(review, "leave"); }
export async function fundingCancel(review: FundingOperationReview): Promise<FundingMutation> { return roomMutation(review, "cancel"); }
export async function fundingCommit(review: FundingOperationReview): Promise<FundingMutation> { return roomMutation(review, "commit"); }
export async function fundingReveal(review: FundingOperationReview): Promise<FundingMutation> { return roomMutation(review, "reveal"); }
export async function fundingFinalize(review: FundingOperationReview): Promise<FundingMutation> { return roomMutation(review, "finalize"); }
export async function fundingPostpone(review: FundingOperationReview, delaySeconds: number): Promise<FundingMutation> { return roomMutation(review, "postpone", delaySeconds); }
