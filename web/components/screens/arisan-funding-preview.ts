import { PREVIEW_WALLET, PREVIEW_RECIPIENT } from "@/lib/local-preview";
import type { FundingRoomState, FundingJoinReview, FundingDepositReview } from "@/lib/arisan-funding";

// Browser-local test doubles only. Never used by server actions or real wallets.
export const FUNDING_PREVIEW_CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
export const FUNDING_PREVIEW_ACTORS = [PREVIEW_WALLET.address, PREVIEW_RECIPIENT,
  "GAXPCCZD3AKYIRCI5CCX2TRIMVGQ45XEUEZPF5RBUZHYFRRZGN64ZNO3"];
const KEY = "salapi.preview.installments.v1";
export function previewFundingActor(): number {
  const actor = Number(sessionStorage.getItem(`${KEY}.actor`) ?? "0");
  return [0,1,2].includes(actor) ? actor : 0;
}
export function savePreviewFundingActor(actor: number) {
  if (![0,1,2].includes(actor)) throw new Error("Invalid local actor.");
  sessionStorage.setItem(`${KEY}.actor`, String(actor));
}
type SavedRoom = { id: number; name: string; code: string; host: string; memberTarget: number; shareStroops: string; cadence: "Weekly" | "Biweekly" | "Monthly"; fundingDeadline: number; status: "Open" | "Active" | "Done" | "Dissolved"; round: number; paid: Record<string, string>; members: string[]; winners: string[]; firstKocok: number };
type Store = { nextId: number; rooms: SavedRoom[] };

function store(): Store {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return { nextId: 1, rooms: [] };
  const parsed = JSON.parse(raw) as Store;
  if (!Number.isSafeInteger(parsed.nextId) || !Array.isArray(parsed.rooms)) throw new Error("Local room storage is unreadable.");
  return parsed;
}
function save(data: Store) {
  const raw = JSON.stringify(data);
  sessionStorage.setItem(KEY, raw);
  if (sessionStorage.getItem(KEY) !== raw) throw new Error("Local room save could not be confirmed.");
}
function state(room: SavedRoom, viewer: string): FundingRoomState {
  const obligation = BigInt(room.shareStroops) * BigInt(room.memberTarget);
  const seats = room.members.map(addr => {
    const paid = BigInt(room.paid[addr] ?? "0");
    return { addr, isYou: addr === viewer, paidStroops: paid.toString(), remainingStroops: (obligation - paid).toString(), fullyFunded: paid === obligation, won: room.winners.includes(addr), committed: false, revealed: false };
  });
  const my = seats.find(seat => seat.isYou);
  const open = room.status === "Open";
  const inTime = Math.floor(Date.now()/1000) < room.fundingDeadline;
  const isMember = !!my;
  const isHost = room.host === viewer;
  const fullyFundedCount = seats.filter(seat => seat.fullyFunded).length;
  const pooled = seats.reduce((sum, seat) => sum + BigInt(seat.paidStroops), 0n) - BigInt(room.winners.length) * obligation;
  return { ready: true, contractId: FUNDING_PREVIEW_CONTRACT, id: room.id, name: room.name, status: room.status,
    code: isMember ? room.code : null, viewer, viewerIdentity: "personal", host: room.host, isHost, isMember,
    memberTarget: room.memberTarget, memberCount: seats.length, shareStroops: room.shareStroops, obligationStroops: obligation.toString(), pooledStroops: pooled.toString(), fullyFundedCount, fundingDeadline: room.fundingDeadline, firstKocok: room.firstKocok, cadence: room.cadence, cadenceSecs: { Weekly: 60, Biweekly: 120, Monthly: 300 }[room.cadence], round: room.round, seats,
    winners: room.winners.map((addr,index) => ({ round: index+1, addr })),
    drawPhase: room.status === "Active" ? "Finalizable" : null, commitAt: room.firstKocok, revealAt: room.firstKocok, commitCount: 0, revealCount: 0,
    canJoin: open && inTime && !isMember && seats.length < room.memberTarget, canDeposit: open && inTime && !!my && !my.fullyFunded,
    readyToStart: open && inTime && isHost && seats.length === room.memberTarget && fullyFundedCount === room.memberTarget,
    canLeave: open && isMember && !isHost, canCancel: open && (isHost || !inTime), canCommit: false, canReveal: false, canFinalize: room.status === "Active" && isMember };
}
export function previewFundingList(viewer: string) { return store().rooms.filter(room => room.members.includes(viewer)).map(room => state(room, viewer)); }
export function previewFundingState(id: number, viewer: string): FundingRoomState {
  const room = store().rooms.find(room => room.id === id);
  if (!room) throw new Error("Local room not found. Create one first.");
  return state(room, viewer);
}
export function previewFundingCreate(input: { name: string; memberTarget: number; shareStroops: string; cadence: SavedRoom["cadence"]; fundingDays: number }, viewer: string) {
  const data = store();
  if (!input.name.trim() || !Number.isInteger(input.memberTarget) || input.memberTarget < 3 || input.memberTarget > 20 || BigInt(input.shareStroops) <= 0n || ![1,3,7,14,30].includes(input.fundingDays)) throw new Error("Invalid local room terms.");
  const id = data.nextId++;
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const code = `QA${[0,5,10,15].map(shift => alphabet[(id >>> shift)&31]).join("")}`;
  data.rooms.push({ id, name: input.name, code, host: viewer, memberTarget: input.memberTarget, shareStroops: input.shareStroops, cadence: input.cadence, fundingDeadline: Math.floor(Date.now()/1000)+input.fundingDays*86400, status: "Open", round: 0, paid: { [viewer]: "0" }, members: [viewer], winners: [], firstKocok: 0 });
  save(data);
  return { ok: true as const, id };
}
export function previewFundingResolve(code: string, viewer: string) {
  const room = store().rooms.find(room => room.code === code);
  if (!room) throw new Error("Local invite not found. Use the code shown in your local room.");
  const current = state(room, viewer);
  const review: FundingJoinReview = { contractId: FUNDING_PREVIEW_CONTRACT, roomId: room.id, code, viewer, shareStroops: current.shareStroops, obligationStroops: current.obligationStroops, memberTarget: room.memberTarget, fundingDeadline: room.fundingDeadline, cadence: room.cadence };
  return { ok: true as const, id: room.id, code, room: current, review };
}
export function previewFundingMutate(id: number, viewer: string, kind: "join" | "deposit" | "start" | "leave" | "cancel" | "finalize", review?: FundingJoinReview | FundingDepositReview) {
  const data = store();
  const room = data.rooms.find(room => room.id === id);
  if (!room) throw new Error("Local room not found.");
  const current = state(room, viewer);
  if (kind === "join" || kind === "deposit") {
    if (!review || review.viewer !== viewer || review.contractId !== FUNDING_PREVIEW_CONTRACT || review.roomId !== id || review.shareStroops !== current.shareStroops || review.obligationStroops !== current.obligationStroops || review.memberTarget !== current.memberTarget || review.fundingDeadline !== current.fundingDeadline || review.cadence !== room.cadence) throw new Error("Terms changed. Review again.");
  }
  if (kind === "join") {
    if (!current.canJoin || review?.code !== room.code) throw new Error("Joining is unavailable.");
    room.members.push(viewer); room.paid[viewer] = "0";
  } else if (kind === "deposit") {
    const deposit = review as FundingDepositReview;
    const my = current.seats.find(seat => seat.isYou)!;
    const amount = BigInt(deposit.amountStroops);
    if (!current.canDeposit || deposit.paidBeforeStroops !== my.paidStroops || amount <= 0n || amount > BigInt(my.remainingStroops)) throw new Error("Contribution changed or exceeds the remaining obligation.");
    room.paid[viewer] = (BigInt(my.paidStroops)+amount).toString();
  } else if (kind === "start") {
    if (!current.readyToStart) throw new Error("Every member must be fully funded before Start.");
    room.status = "Active"; room.round = 1; room.firstKocok = Math.floor(Date.now()/1000)+300;
  } else if (kind === "leave") {
    if (!current.canLeave) throw new Error("Leaving is unavailable.");
    room.members = room.members.filter(addr => addr !== viewer); delete room.paid[viewer];
  } else if (kind === "cancel") {
    if (!current.canCancel) throw new Error("Cancellation is unavailable.");
    room.status = "Dissolved"; room.paid = {};
  } else {
    if (!current.canFinalize) throw new Error("Local payout is unavailable.");
    const winner = room.members.find(addr => !room.winners.includes(addr))!;
    room.winners.push(winner); room.round++;
    if (room.winners.length === room.memberTarget) room.status = "Done";
  }
  save(data);
  return { ok: true as const, id };
}
