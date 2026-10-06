import type { arisanRoomState } from "@/app/actions";

export type PreviewArisanRoom = Extract<Awaited<ReturnType<typeof arisanRoomState>>, { ready: true }>;
export const previewArisanRoomKey = (id: number) => `salapi.preview.arisan-room.${id}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

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
  if (!Array.isArray(value.winners) || !value.winners.every(winner => isRecord(winner) && finiteNumber(winner.round) && finiteNumber(winner.ts) && typeof winner.addr === "string" && typeof winner.label === "string")) return false;
  return true;
}

export function readPreviewArisanRoom(id: number, checked = false): PreviewArisanRoom | null {
  if (typeof window === "undefined") return null;
  try {
    const snapshot: unknown = JSON.parse(sessionStorage.getItem(previewArisanRoomKey(id)) || "null");
    return isRecord(snapshot) && snapshot.version === 1 && isRoom(snapshot.room, id) ? snapshot.room : null;
  } catch (error) { if (checked) throw error; return null; }
}

export type PreviewArisanChange = { key: string; value: string | null };

// Session storage has no transaction API. Snapshot exact prior values first,
// validate every write, then restore them on a partial failure where possible.
// A failed rollback still returns false; the UI must not announce saved state.
export function commitPreviewArisanSession(changes: PreviewArisanChange[]): boolean {
  if (typeof window === "undefined") return false;
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
  return commitPreviewArisanSession([{ key: previewArisanRoomKey(room.id), value: JSON.stringify({ version: 1, room }) }, ...additional]);
}

export function clearPreviewArisanRoom(id: number): boolean {
  return commitPreviewArisanSession([{ key: previewArisanRoomKey(id), value: null }]);
}
