/** Social coordination only. None of these fields authorize money movement or
 * alter the contract's funding, draw, eligibility, or payout rules. */
export type ArisanGatheringKind = "upfront" | "installments" | "scheduled";
export type ArisanGatheringScope = { kind: ArisanGatheringKind; roomId: number };
export type ArisanGatheringMode = "in_person" | "online" | "hybrid";
export type ArisanGatheringRsvpResponse = "yes" | "no" | "maybe";
export type ArisanGatheringFields = {
  mode: ArisanGatheringMode;
  venueName: string;
  address: string;
  mapsUrl: string;
  onlineUrl: string;
  startsAt: string | null;
  timeZone: string | null;
};
export type ArisanGathering = ArisanGatheringScope & ArisanGatheringFields & {
  id: string; contractId: string; revision: number; updatedAt: string;
};
export type ArisanGatheringSave = ArisanGatheringScope & ArisanGatheringFields & {
  expectedRevision: number; mutationId: string;
};
export type ArisanGatheringRsvp = { wallet: string; response: ArisanGatheringRsvpResponse; updatedAt: string };
export type ArisanNotificationType = "meeting_updated" | "meeting_day_before" | "meeting_hour_before"
  | "funding_complete" | "started" | "round_changed" | "completed" | "cancelled"
  | "funding_deadline_day_before" | "funding_deadline_hour_before" | "commit_deadline_hour_before" | "reveal_deadline_hour_before";
export type ArisanGatheringNotification = ArisanGatheringScope & {
  id: string; contractId: string; type: ArisanNotificationType; title: string; body: string;
  roomName: string; createdAt: string; readAt: string | null; gatheringRevision: number | null; startsAt: string | null; href: string;
};
export type ArisanGatheringFailure = { ok: false; error: string; code?: "unauthorized" | "unavailable" | "invalid" | "conflict" | "forbidden" };
export type ArisanGatheringResult = {
  ok: true; contractId: string; viewer: string; canEdit: boolean; gathering: ArisanGathering | null;
  rsvps: ArisanGatheringRsvp[]; notifications: ArisanGatheringNotification[]; unreadCount: number; delivery: "in_app";
} | ArisanGatheringFailure;
export type ArisanGatheringSaveResult = { ok: true; gathering: ArisanGathering; notifiedMembers: number; delivery: "in_app" } | ArisanGatheringFailure;
export type ArisanGatheringInboxResult = { ok: true; notifications: ArisanGatheringNotification[]; unreadCount: number; delivery: "in_app" } | ArisanGatheringFailure;

export const ARISAN_GATHERING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECORD = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const scopeKeys = ["kind", "roomId"];
export function arisanGatheringScope(value: unknown): ArisanGatheringScope | null {
  if (!RECORD(value) || !["upfront", "installments", "scheduled"].includes(String(value.kind)) || !Number.isSafeInteger(value.roomId) || Number(value.roomId) < 1 || Number(value.roomId) > 0xffff_ffff) return null;
  return { kind: value.kind as ArisanGatheringKind, roomId: Number(value.roomId) };
}
function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value === value.trim() && value.length <= max && !/[\u0000-\u001f\u007f<>]/.test(value);
}
/** Exact hosts and paths, HTTPS only. No fetch or URL-unshortening is performed. */
export function validArisanMapsUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port || value.length > 1200) return false;
    return (url.hostname === "maps.google.com" && (url.pathname === "/" || url.pathname.startsWith("/maps")))
      || (["google.com", "www.google.com"].includes(url.hostname) && /^\/maps(?:\/|$)/.test(url.pathname))
      || (url.hostname === "maps.app.goo.gl" && /^\/[A-Za-z0-9_-]+$/.test(url.pathname))
      || (url.hostname === "goo.gl" && /^\/maps\/[A-Za-z0-9_-]+$/.test(url.pathname));
  } catch { return false; }
}
export function validArisanOnlineUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && value.length <= 1200
      && (url.hostname === "meet.google.com" || url.hostname === "zoom.us" || /^[a-z0-9-]+\.zoom\.us$/.test(url.hostname)
        || url.hostname === "teams.microsoft.com" || url.hostname === "teams.live.com");
  } catch { return false; }
}
export function validArisanTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 100 || value !== "UTC" && !value.includes("/") || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}
export function validateArisanGatheringSave(value: unknown, now = Date.now()): { ok: true; value: ArisanGatheringSave } | ArisanGatheringFailure {
  const scope = arisanGatheringScope(value);
  const keys = [...scopeKeys, "mode", "venueName", "address", "mapsUrl", "onlineUrl", "startsAt", "timeZone", "expectedRevision", "mutationId"];
  if (!scope || !RECORD(value) || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(value, key))) return { ok: false, code: "invalid", error: "Invalid room or meeting fields." };
  if (!["in_person", "online", "hybrid"].includes(String(value.mode)) || !safeText(value.venueName, 120) || !safeText(value.address, 500)
    || !safeText(value.mapsUrl, 1200) || !validArisanMapsUrl(value.mapsUrl) || !safeText(value.onlineUrl, 1200) || !validArisanOnlineUrl(value.onlineUrl)
    || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 0 || Number(value.expectedRevision) > 2_000_000_000
    || typeof value.mutationId !== "string" || !ARISAN_GATHERING_UUID.test(value.mutationId)) return { ok: false, code: "invalid", error: "Review the meeting details and allowed Maps or meeting URL." };
  if (value.mode === "online" && (value.venueName || value.address || value.mapsUrl) || value.mode === "in_person" && value.onlineUrl) return { ok: false, code: "invalid", error: "Use only fields matching the meeting format." };
  if (value.startsAt === null ? value.timeZone !== null : typeof value.startsAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.startsAt)
    || !Number.isFinite(Date.parse(value.startsAt)) || new Date(value.startsAt).toISOString() !== (value.startsAt.includes(".") ? value.startsAt : value.startsAt.replace(/Z$/, ".000Z"))
    || Date.parse(value.startsAt) <= now || Date.parse(value.startsAt) > now + 366 * 86400_000 || !validArisanTimeZone(value.timeZone)) return { ok: false, code: "invalid", error: "Choose a future UTC meeting time within one year and a valid timezone, or leave both empty." };
  return { ok: true, value: { ...scope, mode: value.mode as ArisanGatheringMode, venueName: value.venueName, address: value.address, mapsUrl: value.mapsUrl,
    onlineUrl: value.onlineUrl, startsAt: value.startsAt === null ? null : new Date(value.startsAt as string).toISOString(), timeZone: value.timeZone as string | null,
    expectedRevision: Number(value.expectedRevision), mutationId: value.mutationId.toLowerCase() } };
}
export function arisanRoomHref(scope: ArisanGatheringScope): string {
  return scope.kind === "scheduled" ? `/arisan/scheduled/${scope.roomId}` : scope.kind === "installments" ? `/arisan/funding/${scope.roomId}` : `/arisan/${scope.roomId}`;
}
