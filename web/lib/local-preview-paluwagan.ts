import { isLocalPreview } from "./local-preview";
import { pesosToStroopsExact, STROOPS_PER_XLM } from "./money";

export const LOCAL_PALUWAGAN_KEY = "salapi.preview.paluwagan:v1";
export const LOCAL_PALUWAGAN_ROSTER = [
  { id: "you", label: "You" },
  { id: "maria", label: "Maria" },
  { id: "jose", label: "Jose" },
] as const;
const ROTATION = ["maria", "jose", "you"] as const;
const SHARE = pesosToStroopsExact("84.24")!;
const FULL_POT = SHARE * BigInt(LOCAL_PALUWAGAN_ROSTER.length);
export type LocalPaluwaganAction = "pay-mine" | "friends-pay" | "collect";
export type LocalPaluwaganState = {
  version: 1;
  revision: number;
  round: number;
  shareStroops: string;
  paid: boolean[];
  payouts: { round: number; recipientId: typeof ROTATION[number]; amountStroops: string }[];
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Result = { ok: true; state: LocalPaluwaganState } | { ok: false; error: string };
const STORAGE_ERROR = "This local change could not be confirmed in browser storage. No tokens moved. Reload the local circle to inspect its saved state before retrying.";

function initialState(): LocalPaluwaganState {
  // The two paid seats are fictional starting data, not existing deposits.
  return { version: 1, revision: 0, round: 0, shareStroops: SHARE.toString(), paid: [true, true, false], payouts: [] };
}

function storageOrNull(supplied?: StorageLike): StorageLike | null {
  if (!isLocalPreview) return null;
  if (supplied) return supplied;
  try { return typeof window === "undefined" ? null : window.sessionStorage; }
  catch { return null; }
}

function validState(input: unknown): input is LocalPaluwaganState {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const value = input as LocalPaluwaganState;
  if (value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.revision > 12 ||
    !Number.isInteger(value.round) || value.round < 0 || value.round > ROTATION.length ||
    value.shareStroops !== SHARE.toString() || !Array.isArray(value.paid) || value.paid.length !== LOCAL_PALUWAGAN_ROSTER.length ||
    !value.paid.every(paid => typeof paid === "boolean") || !Array.isArray(value.payouts) || value.payouts.length !== value.round) return false;
  if (value.round === 0) {
    if (!value.paid[0] || !value.paid[1] || value.revision !== (value.paid[2] ? 1 : 0)) return false;
  } else if (value.round === ROTATION.length) {
    if (value.paid.some(Boolean) || value.revision !== 8) return false;
  } else {
    // Friends pay together in this local model. Only reachable revisions are
    // accepted, so a forged completed round cannot be presented as saved history.
    const baseRevision = value.round === 1 ? 2 : 5;
    if (value.paid[1] !== value.paid[2] || value.revision !== baseRevision + Number(value.paid[0]) + Number(value.paid[1])) return false;
  }
  return value.payouts.every((payout, index) => payout && payout.round === index + 1 &&
    payout.recipientId === ROTATION[index] && payout.amountStroops === FULL_POT.toString());
}

function read(storage: StorageLike): Result {
  try {
    const raw = storage.getItem(LOCAL_PALUWAGAN_KEY);
    if (raw === null) return { ok: true, state: initialState() };
    if (raw.length > 2048) return { ok: false, error: "The saved local circle is unreadable. No example data was overwritten." };
    const state: unknown = JSON.parse(raw);
    return validState(state) ? { ok: true, state } : { ok: false, error: "The saved local circle is invalid. No example data was overwritten." };
  } catch { return { ok: false, error: "Browser storage is unavailable or unreadable. Local actions are blocked until the circle can be loaded." }; }
}

export function readLocalPaluwagan(supplied?: StorageLike): Result {
  const storage = storageOrNull(supplied);
  return storage ? read(storage) : { ok: false, error: "Local circle storage is unavailable. No transaction was sent." };
}

export function applyLocalPaluwagan(action: LocalPaluwaganAction, expectedRevision: number, supplied?: StorageLike): Result {
  const storage = storageOrNull(supplied);
  if (!storage) return { ok: false, error: "Local actions cannot access browser storage. No transaction was sent." };
  const current = read(storage);
  if (!current.ok) return current;
  if (current.state.revision !== expectedRevision) return { ok: false, error: "The local circle changed after review. Reload it and review the current round before confirming." };
  if (current.state.round >= ROTATION.length) return { ok: false, error: "This example cycle is complete. All three members have received one local example payout." };
  const next: LocalPaluwaganState = { ...current.state, revision: current.state.revision + 1, paid: [...current.state.paid], payouts: [...current.state.payouts] };
  if (action === "pay-mine") {
    if (next.paid[0]) return { ok: false, error: "Your example share is already marked paid in this round." };
    next.paid[0] = true;
  } else if (action === "friends-pay") {
    if (next.paid.slice(1).every(Boolean)) return { ok: false, error: "Both friends are already marked paid in this example round." };
    next.paid = next.paid.map((paid, index) => index === 0 ? paid : true);
  } else if (action === "collect") {
    if (!next.paid.every(Boolean)) return { ok: false, error: "Every member must mark their share paid before this example payout." };
    next.payouts.push({ round: next.round + 1, recipientId: ROTATION[next.round], amountStroops: FULL_POT.toString() });
    next.round += 1;
    next.paid = LOCAL_PALUWAGAN_ROSTER.map(() => false);
  } else return { ok: false, error: "Unknown local action. No example data was changed." };

  // A single versioned record commits the whole round. Never update a balance,
  // wallet, provider or on-chain history. Restore the exact old raw value if
  // a write/read-back failure happened after storage accepted a partial write.
  let previous: string | null;
  try { previous = storage.getItem(LOCAL_PALUWAGAN_KEY); }
  catch { return { ok: false, error: STORAGE_ERROR }; }
  try {
    const raw = JSON.stringify(next);
    storage.setItem(LOCAL_PALUWAGAN_KEY, raw);
    if (storage.getItem(LOCAL_PALUWAGAN_KEY) !== raw) throw new Error("Local circle read-back failed.");
    return { ok: true, state: next };
  } catch {
    try {
      if (previous === null) storage.removeItem(LOCAL_PALUWAGAN_KEY);
      else storage.setItem(LOCAL_PALUWAGAN_KEY, previous);
    } catch { /* Recovery may itself be unavailable; callers reload rather than claim a save. */ }
    return { ok: false, error: STORAGE_ERROR };
  }
}

export function localPaluwaganSummary(state: LocalPaluwaganState) {
  const completed = state.round === ROTATION.length;
  const recipientId = completed ? null : ROTATION[state.round];
  const recipient = LOCAL_PALUWAGAN_ROSTER.find(member => member.id === recipientId);
  const paidCount = state.paid.filter(Boolean).length;
  const potStroops = SHARE * BigInt(paidCount);
  return { completed, recipientId, recipientLabel: recipient?.label ?? "Cycle complete", paidCount,
    potStroops: potStroops.toString(), fullPotStroops: FULL_POT.toString(),
    allPaid: !completed && paidCount === LOCAL_PALUWAGAN_ROSTER.length };
}

/** Floating point is allowed only after the exact example ledger is projected for display. */
export function localPaluwaganDisplayPesos(stroops: string): number {
  return Number(BigInt(stroops) * 13n) / Number(STROOPS_PER_XLM * 2n);
}
