import type { arisanRoomState } from "@/app/actions";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import { pesosToStroopsExact } from "@/lib/money";

export type PreviewArisanRoom = Extract<Awaited<ReturnType<typeof arisanRoomState>>, { ready: true }>;
export const previewArisanRoomKey = (id: number) => `salapi.preview.arisan-room.${id}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

type PreviewArisanSeat = PreviewArisanRoom["seats"][number];
type PreviewRandomFill = (values: Uint32Array) => void;

// Local demonstration only. This does not predict, choose or authorize a live
// contract winner. A sole eligible member is returned without pretending a draw
// is needed. Missing entropy or malformed snapshots never use a weaker fallback.
export function choosePreviewArisanWinner<T extends PreviewArisanSeat>(
  seats: readonly T[],
  fillRandom?: PreviewRandomFill,
): T | null {
  if (!isLocalPreview || !Array.isArray(seats) || seats.length > 20) return null;
  const addresses = new Set<string>();
  for (const seat of seats) {
    if (!isRecord(seat) || typeof seat.addr !== "string" || !seat.addr.trim()
      || typeof seat.label !== "string"
      || !["won", "committed", "revealed", "isYou"].every(key => typeof seat[key] === "boolean")
      || seat.revealed && !seat.committed || addresses.has(seat.addr)) return null;
    addresses.add(seat.addr);
  }
  const eligible = seats.filter(seat => !seat.won && seat.committed && seat.revealed);
  if (eligible.length < 2) return eligible[0] ?? null;

  // All 2^32 input values must map equally often to each eligible seat. Discard
  // the incomplete upper bucket instead of biasing the result with raw modulo.
  const range = 0x1_0000_0000;
  const limit = range - range % eligible.length;
  const fill = fillRandom ?? ((values: Uint32Array) => { globalThis.crypto.getRandomValues(values); });
  const sample = new Uint32Array(1);
  try {
    // Bound a defective/injected entropy source; never hang or silently fall back.
    for (let attempt = 0; attempt < 128; attempt++) {
      fill(sample);
      if (sample[0] < limit) return eligible[sample[0] % eligible.length];
    }
  } catch { /* An unavailable crypto source must not select a first-seat fallback. */ }
  return null;
}

// These are local example snapshots, never contract state or signing inputs.
// Ignore old or malformed browser data instead of trusting arbitrary JSON.
function isRoom(value: unknown, id: number): value is PreviewArisanRoom {
  if (!isRecord(value) || value.ready !== true || value.id !== id) return false;
  const stringFields = ["name", "host", "hostLabel", "sharePeso", "potPeso"];
  if (!stringFields.every(key => typeof value[key] === "string")) return false;
  if (value.code !== null && typeof value.code !== "string") return false;
  if (typeof value.cadence !== "string" || !["Weekly", "Biweekly", "Monthly"].includes(value.cadence)) return false;
  if (typeof value.status !== "string" || !["Open", "Active", "Done", "Dissolved"].includes(value.status)) return false;
  if (value.drawPhase !== null && (typeof value.drawPhase !== "string" || !["Commit", "Reveal", "Finalizable"].includes(value.drawPhase))) return false;
  const numericFields = ["cadenceSecs", "memberTarget", "memberCount", "sharePesos", "potPesos", "round", "firstKocok", "joinDeadline", "commitAt", "revealAt", "nextActionAt", "commitCount", "revealCount", "eligibleCount"];
  if (!numericFields.every(key => finiteNumber(value[key]) && value[key] >= 0)) return false;
  const target = value.memberTarget as number;
  const share = value.sharePesos as number;
  const pot = value.potPesos as number;
  if (!Number.isInteger(target) || target < 3 || target > 20 || share <= 0) return false;
  if (Math.abs(pot - share * target) > Math.max(0.000001, pot * 0.000000001)) return false;
  const booleanFields = ["isMember", "isHost", "readyToStart", "canCommit", "canReveal", "canFinalize"];
  if (!booleanFields.every(key => typeof value[key] === "boolean")) return false;
  if (!Array.isArray(value.seats) || value.seats.length > target || value.memberCount !== value.seats.length) return false;
  if (!value.seats.every(seat => isRecord(seat) && typeof seat.addr === "string" && typeof seat.label === "string" && ["won", "committed", "revealed", "isYou"].every(key => typeof seat[key] === "boolean"))) return false;
  if (!value.seats.every(seat => seat.fundedStroops === null || typeof seat.fundedStroops === "string" && /^(0|[1-9]\d{0,38})$/.test(seat.fundedStroops) && BigInt(seat.fundedStroops) <= (1n << 127n) - 1n)) return false;
  if (!Array.isArray(value.winners) || !value.winners.every(winner => isRecord(winner) && finiteNumber(winner.round) && finiteNumber(winner.ts) && typeof winner.addr === "string" && typeof winner.label === "string")) return false;
  if (typeof value.shareStroops !== "string" || !/^[1-9]\d{0,38}$/.test(value.shareStroops) || typeof value.depositStroops !== "string" || !/^[1-9]\d{0,38}$/.test(value.depositStroops) || BigInt(value.depositStroops) !== BigInt(value.shareStroops) * BigInt(target)) return false;
  if (value.viewer !== PREVIEW_WALLET.address || typeof value.canUseDemoFriends !== "boolean") return false;
  return true;
}

// Version 1 snapshots predate the exact local amount and demo-control fields.
// Upgrade the returned local shape only; initial reads never rewrite storage.
// Browser snapshots cannot authorize real-room actions because this helper is
// disabled outside explicit local preview and never supplies a live DTO.
function localRoom(value: unknown, id: number): PreviewArisanRoom | null {
  if (!isRecord(value) || !finiteNumber(value.sharePesos) || !finiteNumber(value.memberTarget) || !Number.isInteger(value.memberTarget) || value.memberTarget < 3 || value.memberTarget > 20) return null;
  const share = pesosToStroopsExact(String(value.sharePesos));
  if (share === null || share <= 0n) return null;
  const canUseDemoFriends = value.isHost === true && value.isMember === true && value.host === PREVIEW_WALLET.address && Array.isArray(value.seats) && value.seats.some(seat => isRecord(seat) && seat.isYou === true && seat.addr === PREVIEW_WALLET.address);
  const depositStroops = (share * BigInt(value.memberTarget)).toString();
  // Historical local examples were fully prefunded. Upgrade only missing local
  // fields, preserve explicit unknown amounts, and never infer live deposits.
  const seats = Array.isArray(value.seats) ? value.seats.map(seat => isRecord(seat) ? { ...seat, fundedStroops: seat.fundedStroops === undefined ? depositStroops : seat.fundedStroops } : seat) : value.seats;
  const migrated = { ...value, seats, shareStroops: share.toString(), depositStroops, viewer: PREVIEW_WALLET.address, canUseDemoFriends };
  return isRoom(migrated, id) ? migrated : null;
}

export function readPreviewArisanRoom(id: number, checked = false): PreviewArisanRoom | null {
  if (!isLocalPreview || typeof window === "undefined") return null;
  try {
    const snapshot: unknown = JSON.parse(sessionStorage.getItem(previewArisanRoomKey(id)) || "null");
    return isRecord(snapshot) && snapshot.version === 1 ? localRoom(snapshot.room, id) : null;
  } catch (error) { if (checked) throw error; return null; }
}

export type PreviewArisanChange = { key: string; value: string | null };

// Session storage has no transaction API. Snapshot exact prior values first,
// validate every write, then restore them on a partial failure where possible.
// A failed rollback still returns false; the UI must not announce saved state.
export function commitPreviewArisanSession(changes: PreviewArisanChange[]): boolean {
  if (!isLocalPreview || typeof window === "undefined") return false;
  if (!changes.length || changes.some(change => !/^salapi\.preview\.arisan-(?:draft|joined|left|room\.\d+|cancelled\.\d+)$/.test(change.key)) || new Set(changes.map(change => change.key)).size !== changes.length) return false;
  const prior = new Map<string, string | null>();
  try {
    for (const change of changes) prior.set(change.key, sessionStorage.getItem(change.key));
    // Confirm non-destructive writes before removing superseded snapshots.
    const ordered = [...changes.filter(change => change.value !== null), ...changes.filter(change => change.value === null)];
    for (const change of ordered) {
      if (change.value === null) sessionStorage.removeItem(change.key);
      else sessionStorage.setItem(change.key, change.value);
      if (sessionStorage.getItem(change.key) !== change.value) throw new Error("Preview save was not confirmed.");
    }
    if (changes.some(change => sessionStorage.getItem(change.key) !== change.value)) throw new Error("Preview save was not confirmed.");
    return true;
  } catch {
    for (const [key, value] of prior) {
      try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); }
      catch { /* No saved-success claim is permitted if storage also denies rollback. */ }
    }
    return false;
  }
}

export function savePreviewArisanRoom(room: PreviewArisanRoom, additional: PreviewArisanChange[] = []): boolean {
  if (!isLocalPreview) return false;
  const normalized = localRoom(room, room.id);
  return normalized ? commitPreviewArisanSession([{ key: previewArisanRoomKey(room.id), value: JSON.stringify({ version: 1, room: normalized }) }, ...additional]) : false;
}

export function clearPreviewArisanRoom(id: number): boolean {
  return commitPreviewArisanSession([{ key: previewArisanRoomKey(id), value: null }]);
}
