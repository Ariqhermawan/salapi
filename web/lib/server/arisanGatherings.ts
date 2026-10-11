import "server-only";
import { createHash } from "node:crypto";
import { Account, BASE_FEE, Contract, Networks, rpc, scValToNative, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { isLocalPreview } from "@/lib/local-preview";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { supabaseAdminConfigured } from "@/lib/supabase/env";
import { authenticatedArisanWallet } from "./arisanAuthorization";
import { arisanRoomsId, RPC_URL, sc } from "./stellar";
import { ARISAN_GATHERING_UUID, arisanGatheringScope, arisanRoomHref, validateArisanGatheringSave,
  type ArisanGathering, type ArisanGatheringFailure, type ArisanGatheringInboxResult, type ArisanGatheringKind,
  type ArisanGatheringNotification, type ArisanGatheringResult, type ArisanGatheringSaveResult, type ArisanGatheringScope,
  type ArisanNotificationType } from "@/lib/arisan-gatherings";

const TABLE = "arisan_gatherings", INBOX = "arisan_member_notifications";
const TIMEOUT = 4000;
const READ_SOURCE = StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue => !!v && typeof v === "object" && !Array.isArray(v);
const invalid = (error: string): ArisanGatheringFailure => ({ ok: false, code: "invalid", error });
const unavailable = (): ArisanGatheringFailure => ({ ok: false, code: "unavailable", error: "Room coordination is unavailable. Nothing has been confirmed as saved or sent." });
const forbidden = (): ArisanGatheringFailure => ({ ok: false, code: "forbidden", error: "Only verified saved-wallet room members can view these details; only the host can edit them." });

export function arisanGatheringContract(kind: ArisanGatheringKind): string | null {
  const legacy = arisanRoomsId()?.trim(), installment = process.env.ARISAN_INSTALLMENTS_CONTRACT?.trim(), scheduled = process.env.ARISAN_SCHEDULED_CONTRACT?.trim();
  const id = kind === "upfront" ? legacy : kind === "installments" ? installment : kind === "scheduled" ? scheduled : undefined;
  if (!id || !StrKey.isValidContract(id) || kind !== "upfront" && id === legacy || kind === "scheduled" && id === installment) return null;
  return id;
}
function integer(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== "number" && typeof v !== "bigint") throw Error("Invalid contract integer");
  const n = Number(v); if (!Number.isSafeInteger(n) || n < min || n > max) throw Error("Invalid contract integer"); return n;
}
function variant(v: unknown): unknown { return Array.isArray(v) && v.length === 1 ? v[0] : v; }
function notificationRoomName(value: string, scope: ArisanGatheringScope): string {
  if (scope.kind === "scheduled") {
    // This deployment must enforce the same UTF-8 boundary at creation. Do not
    // silently accept a mixed-mode/older scheduled contract with unsafe names.
    if (!value || /^\p{White_Space}|\p{White_Space}$/u.test(value) || Buffer.byteLength(value, "utf8") > 120 || /[\p{Cc}<>]/u.test(value)) throw Error("Invalid scheduled room name");
    return value;
  }
  // Historical contracts accepted arbitrary names. Normalize only this social
  // display label, never the raw header used to verify a consistent chain read.
  const label = Array.from(value.replace(/[\p{Cc}<>]/gu, "").trim()).slice(0, 120).join("");
  return label || `Arisan room #${scope.roomId}`;
}
async function bounded<T>(task: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([task, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("Read unavailable")), TIMEOUT); })]); }
  finally { if (timer) clearTimeout(timer); }
}
export type ArisanNotificationRoom = ArisanGatheringScope & {
  contractId: string; host: string; name: string; members: string[]; status: "Open" | "Active" | "Done" | "Dissolved";
  memberTarget: number; fullyFundedCount: number; round: number; fundingDeadline: number; commitAt: number; revealAt: number;
  drawPhase: "Commit" | "Reveal" | "Finalizable" | null;
};
/** Fixed allowlisted deployment, unsigned simulations, fresh roster. No demo
 * account, provisioning, wallet secret, or transaction submission is involved. */
export async function readArisanNotificationRoom(scope: ArisanGatheringScope): Promise<ArisanNotificationRoom> {
  const contractId = arisanGatheringContract(scope.kind);
  if (isLocalPreview || !arisanGatheringScope(scope) || !contractId) throw Error("Room deployment unavailable");
  const server = new rpc.Server(RPC_URL, { timeout: TIMEOUT });
  const read = async (method: string, args = [sc.u32(scope.roomId)]) => {
    const tx = new TransactionBuilder(new Account(READ_SOURCE, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(new Contract(contractId).call(method, ...args)).setTimeout(30).build();
    const result = await bounded(server.simulateTransaction(tx));
    if (!rpc.Api.isSimulationSuccess(result) || !result.result) throw Error("Room read failed");
    return scValToNative(result.result.retval) as unknown;
  };
  const [raw, members, funding, scheduledOnly] = await Promise.all([read("get_room"), read("get_members"), scope.kind === "upfront" ? null : read("funding_state"), scope.kind === "scheduled" ? read("scheduled_only", []) : null]);
  if (scope.kind === "scheduled" && scheduledOnly !== true) throw Error("Scheduled-only deployment required");
  if (!record(raw) || !Array.isArray(members)) throw Error("Invalid room");
  const target = integer(raw.member_target, 3, 20), count = integer(raw.member_count, 1, target);
  if (members.length !== count || !members.every((m): m is string => typeof m === "string" && StrKey.isValidEd25519PublicKey(m)) || new Set(members).size !== count
    || typeof raw.host !== "string" || !StrKey.isValidEd25519PublicKey(raw.host) || typeof raw.name !== "string") throw Error("Invalid roster");
  const name = notificationRoomName(raw.name, scope);
  const status = variant(raw.status);
  if (status !== "Open" && status !== "Active" && status !== "Done" && status !== "Dissolved") throw Error("Invalid status");
  const round = integer(raw.round, 0, target + 1), fundingDeadline = integer(raw.join_deadline, 1, 253402300799);
  let fullyFundedCount = count;
  if (scope.kind !== "upfront") {
    if (!record(funding) || variant(funding.mode) !== "Installments" || integer(funding.deadline, 1, 253402300799) !== fundingDeadline) throw Error("Invalid isolated funding state");
    fullyFundedCount = integer(funding.fully_funded_count, 0, count);
  }
  let commitAt = 0, revealAt = 0, drawPhase: ArisanNotificationRoom["drawPhase"] = null;
  if (status === "Active") {
    if (round < 1 || round > target) throw Error("Invalid active round");
    const [commit, reveal, phaseValue] = await Promise.all([read("kocok_at", [sc.u32(scope.roomId), sc.u32(round)]), read("reveal_at", [sc.u32(scope.roomId), sc.u32(round)]), read("draw_phase")]);
    commitAt = integer(commit, 1, 253402300799); revealAt = integer(reveal, 1, 253402300799);
    const phase = variant(phaseValue);
    if (phase !== "Commit" && phase !== "Reveal" && phase !== "Finalizable") throw Error("Invalid draw phase");
    drawPhase = phase;
    if (revealAt < commitAt) throw Error("Invalid draw timetable");
  }
  // A start, membership change or round transition between simulations must not
  // combine a prior room header with newer phase/deadline data.
  const latest = await read("get_room");
  if (!record(latest) || ["host", "name", "member_target", "member_count", "round", "join_deadline"].some(key => String(latest[key]) !== String(raw[key]))
    || variant(latest.status) !== status) throw Error("Room changed during coordination read");
  return { ...scope, contractId, host: raw.host, name, members, status, memberTarget: target, fullyFundedCount, round, fundingDeadline, commitAt, revealAt, drawPhase };
}
type Event = { key: string; type: ArisanNotificationType; title: string; body: string };
export function arisanRoomNotificationEvents(room: ArisanNotificationRoom, now = Date.now()): Event[] {
  const events: Event[] = [], seconds = Math.floor(now / 1000);
  const add = (key: string, type: ArisanNotificationType, title: string, body: string) => events.push({ key, type, title, body });
  if (room.status === "Open" && room.members.length === room.memberTarget && room.fullyFundedCount === room.memberTarget) add("funding_complete", "funding_complete", "Everyone is fully funded", `${room.name} has reached its full member funding requirement. The host still needs to start the room; no draw has happened automatically.`);
  if (room.status === "Active") add(room.round === 1 ? "started" : `round:${room.round}`, room.round === 1 ? "started" : "round_changed", room.round === 1 ? "Your arisan has started" : "A new arisan round is open", `${room.name} is active in round ${room.round}. Open the room to review the current draw phase and deadlines. Already-funded members do not pay again.`);
  if (room.status === "Done") add("completed", "completed", "Your arisan cycle is complete", `${room.name} has completed its cycle. View the payout history in the room. Another cycle needs a new room and fresh member agreement.`);
  if (room.status === "Dissolved") add("cancelled", "cancelled", "Your arisan room was cancelled", `${room.name} is cancelled. Open the room to review its recorded contributions and refund status; this notification is not a refund receipt.`);
  const due = (deadline: number, type: "funding" | "commit" | "reveal") => {
    const remaining = deadline - seconds;
    if (remaining <= 0) return;
    const day = type === "funding" && remaining > 3600 && remaining <= 86400;
    if (!day && remaining > 3600) return;
    const eventType: ArisanNotificationType = type === "funding" ? day ? "funding_deadline_day_before" : "funding_deadline_hour_before" : type === "commit" ? "commit_deadline_hour_before" : "reveal_deadline_hour_before";
    add(`${eventType}:${room.round}:${deadline}`, eventType, type === "funding" ? "Funding deadline approaching" : "Draw entry deadline approaching", `${room.name}: the ${type === "funding" ? "funding" : type === "commit" ? "draw entry" : "draw completion"} deadline is approaching (${new Date(deadline * 1000).toISOString()}). Review the room before acting. No automatic debit or payout is authorized by this reminder.`);
  };
  if (room.status === "Open" && room.fullyFundedCount < room.memberTarget) due(room.fundingDeadline, "funding");
  if (room.status === "Active") { if (room.drawPhase === "Commit") due(room.commitAt, "commit"); else if (room.drawPhase === "Reveal") due(room.revealAt, "reveal"); }
  return events;
}
function notification(row: RecordValue): ArisanGatheringNotification {
  const scope = arisanGatheringScope({ kind: row.room_kind, roomId: Number(row.room_id) });
  if (!scope || typeof row.id !== "string" || !ARISAN_GATHERING_UUID.test(row.id) || typeof row.contract_id !== "string") throw Error("Invalid inbox row");
  return { ...scope, id: row.id, contractId: row.contract_id, type: row.event_type as ArisanNotificationType, title: String(row.title), body: String(row.body), roomName: String(row.room_name),
    createdAt: String(row.created_at), readAt: row.read_at === null ? null : String(row.read_at), gatheringRevision: row.gathering_revision === null ? null : Number(row.gathering_revision), startsAt: row.starts_at === null ? null : String(row.starts_at), href: arisanRoomHref(scope) };
}
function gathering(row: RecordValue): ArisanGathering {
  if (!record(row.details)) throw Error("Invalid meeting row");
  return { ...row.details, id: row.id, contractId: row.contract_id, kind: row.room_kind, roomId: Number(row.room_id), revision: row.revision, updatedAt: row.updated_at } as ArisanGathering;
}
async function owner(): Promise<{ ok: true; publicKey: string } | ArisanGatheringFailure> {
  if (isLocalPreview || !supabaseAdminConfigured()) return unavailable();
  const result = await authenticatedArisanWallet();
  return result.ok ? result : { ok: false, code: "unauthorized", error: "Sign in with your saved Testnet wallet to use room coordination." };
}
function dbFailure(error: { code?: string; message?: string } | null): ArisanGatheringFailure {
  if (error?.code === "40001" || error?.code === "22023") return { ok: false, code: "conflict", error: "Meeting changed or this save ID was already used. Refresh the room before saving again." };
  if (error?.code === "P0001" && error.message === "Wait 30 seconds between meeting updates") return invalid(error.message);
  return unavailable();
}
const inboxColumns = "id,contract_id,room_kind,room_id,event_type,title,body,room_name,created_at,read_at,gathering_revision,starts_at";
export async function readArisanGathering(input: unknown): Promise<ArisanGatheringResult> {
  const scope = arisanGatheringScope(input); if (!scope) return invalid("Invalid room scope.");
  try {
    const who = await owner(); if (!who.ok) return who;
    const room = await readArisanNotificationRoom(scope); if (!room.members.includes(who.publicKey)) return forbidden();
    const db = createSupabaseAdmin();
    const [meet, notices] = await Promise.all([db.from(TABLE).select("id,contract_id,room_kind,room_id,revision,details,updated_at").eq("contract_id", room.contractId).eq("room_kind", scope.kind).eq("room_id", scope.roomId).maybeSingle(),
      db.from(INBOX).select(inboxColumns).eq("wallet", who.publicKey).eq("contract_id", room.contractId).eq("room_kind", scope.kind).eq("room_id", scope.roomId).order("created_at", { ascending: false }).limit(30)]);
    if (meet.error || notices.error) return unavailable();
    const current = meet.data ? gathering(meet.data) : null;
    let rsvps: { wallet: string; response: "yes" | "no" | "maybe"; updatedAt: string }[] = [];
    if (current) {
      const responses = await db.from("arisan_gathering_rsvps").select("wallet,response,updated_at").eq("gathering_id", current.id).eq("revision", current.revision);
      if (responses.error) return unavailable();
      rsvps = (responses.data ?? []).filter(row => room.members.includes(row.wallet)).map(row => ({ wallet: row.wallet, response: row.response, updatedAt: row.updated_at }));
    }
    const notifications = (notices.data ?? []).map(notification);
    return { ok: true, contractId: room.contractId, viewer: who.publicKey, canEdit: room.host === who.publicKey, gathering: current, rsvps, notifications, unreadCount: notifications.filter(n => !n.readAt).length, delivery: "in_app" };
  } catch { return unavailable(); }
}
export async function saveArisanGathering(input: unknown): Promise<ArisanGatheringSaveResult> {
  const checked = validateArisanGatheringSave(input); if (!checked.ok) return checked;
  try {
    const who = await owner(); if (!who.ok) return who;
    const value = checked.value, room = await readArisanNotificationRoom(value);
    if (!room.members.includes(who.publicKey) || room.host !== who.publicKey) return forbidden();
    const { kind, roomId, expectedRevision, mutationId, ...details } = value;
    const hash = createHash("sha256").update(JSON.stringify({ contractId: room.contractId, ...value })).digest("hex");
    const saved = await createSupabaseAdmin().rpc("arisan_gathering_save", { p_contract: room.contractId, p_kind: kind, p_room: roomId, p_host: who.publicKey, p_room_name: room.name,
      p_members: room.members, p_expected_revision: expectedRevision, p_mutation_id: mutationId, p_request_hash: hash, p_details: details });
    if (saved.error) return dbFailure(saved.error);
    if (!record(saved.data) || !record(saved.data.gathering) || !Number.isSafeInteger(saved.data.notifiedMembers)) return unavailable();
    // Best-effort protocol watcher registration is separate from the successful
    // atomic meeting+inbox save. Its failure must not encourage duplicate saves.
    await syncRoom(room).catch(() => {});
    return { ok: true, gathering: saved.data.gathering as ArisanGathering, notifiedMembers: Number(saved.data.notifiedMembers), delivery: "in_app" };
  } catch { return unavailable(); }
}
export async function rsvpArisanGathering(input: unknown): Promise<{ ok: true; response: "yes" | "no" | "maybe" } | ArisanGatheringFailure> {
  const scope = arisanGatheringScope(input);
  if (!scope || !record(input) || Object.keys(input).sort().join(",") !== "kind,response,revision,roomId" || !["yes", "no", "maybe"].includes(String(input.response)) || !Number.isSafeInteger(input.revision) || Number(input.revision) < 1) return invalid("Invalid RSVP.");
  try {
    const who = await owner(); if (!who.ok) return who;
    const room = await readArisanNotificationRoom(scope); if (!room.members.includes(who.publicKey)) return forbidden();
    const db = createSupabaseAdmin(), current = await db.from(TABLE).select("id,revision").eq("contract_id", room.contractId).eq("room_kind", scope.kind).eq("room_id", scope.roomId).maybeSingle();
    if (current.error) return unavailable();
    if (!current.data || current.data.revision !== input.revision) return { ok: false, code: "conflict", error: "Meeting changed. Refresh before responding." };
    const saved = await db.rpc("arisan_gathering_rsvp", { p_gathering: current.data.id, p_revision: input.revision, p_wallet: who.publicKey, p_response: input.response });
    return saved.error ? dbFailure(saved.error) : saved.data === true ? { ok: true, response: input.response as "yes" | "no" | "maybe" } : unavailable();
  } catch { return unavailable(); }
}
export async function readArisanGatheringInbox(): Promise<ArisanGatheringInboxResult> {
  try {
    const who = await owner(); if (!who.ok) return who;
    const db = createSupabaseAdmin(), [rows, count] = await Promise.all([db.from(INBOX).select(inboxColumns).eq("wallet", who.publicKey).order("created_at", { ascending: false }).limit(50),
      db.from(INBOX).select("id", { count: "exact", head: true }).eq("wallet", who.publicKey).is("read_at", null)]);
    if (rows.error || count.error || count.count === null) return unavailable();
    return { ok: true, notifications: (rows.data ?? []).map(notification), unreadCount: count.count, delivery: "in_app" };
  } catch { return unavailable(); }
}
export async function markArisanGatheringNotificationsRead(input: unknown): Promise<{ ok: true; marked: number } | ArisanGatheringFailure> {
  if (!record(input) || Object.keys(input).join(",") !== "ids" || !Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 50 || !input.ids.every(id => typeof id === "string" && ARISAN_GATHERING_UUID.test(id)) || new Set(input.ids).size !== input.ids.length) return invalid("Choose up to 50 notification IDs.");
  try {
    const who = await owner(); if (!who.ok) return who;
    const saved = await createSupabaseAdmin().from(INBOX).update({ read_at: new Date().toISOString() }).eq("wallet", who.publicKey).in("id", input.ids).is("read_at", null).select("id");
    return saved.error ? unavailable() : { ok: true, marked: saved.data?.length ?? 0 };
  } catch { return unavailable(); }
}
async function syncRoom(room: ArisanNotificationRoom): Promise<number> {
  const result = await bounded(Promise.resolve(createSupabaseAdmin().rpc("arisan_room_watch_sync", { p_contract: room.contractId, p_kind: room.kind, p_room: room.roomId, p_members: room.members,
    p_snapshot: { name: room.name, status: room.status, round: room.round, drawPhase: room.drawPhase, fundingDeadline: room.fundingDeadline, commitAt: room.commitAt, revealAt: room.revealAt }, p_events: arisanRoomNotificationEvents(room) })));
  if (result.error || !Number.isSafeInteger(result.data) || result.data < 0) throw Error("Inbox sync unavailable");
  return result.data;
}
/** An explicit member-authorized registration for rooms predating notifications.
 * Kept separate from GET so reading meeting details is never a hidden write. */
export async function watchArisanGathering(input: unknown): Promise<{ ok: true; notifiedMembers: number; delivery: "in_app" } | ArisanGatheringFailure> {
  const scope = arisanGatheringScope(input);
  if (!scope || !record(input) || Object.keys(input).sort().join(",") !== "kind,roomId") return invalid("Invalid room scope.");
  try {
    const who = await owner(); if (!who.ok) return who;
    const room = await readArisanNotificationRoom(scope);
    if (!room.members.includes(who.publicKey)) return forbidden();
    return { ok: true, notifiedMembers: await syncRoom(room), delivery: "in_app" };
  } catch { return unavailable(); }
}
/** Internal post-confirmation hook. Financial confirmation must remain successful
 * even if this best-effort social notification returns an error. */
export async function syncArisanRoomNotifications(kind: ArisanGatheringKind, roomId: number): Promise<{ ok: true; notifiedMembers: number } | ArisanGatheringFailure> {
  const scope = arisanGatheringScope({ kind, roomId });
  if (!scope || isLocalPreview || !supabaseAdminConfigured()) return unavailable();
  try { return { ok: true, notifiedMembers: await syncRoom(await readArisanNotificationRoom(scope)) }; } catch { return unavailable(); }
}
/** Bounded scheduled-only discovery repairs a lost create hook even when no
 * member reopens that room. Only fresh chain IDs and rosters are persisted. */
export async function discoverArisanScheduledRooms(): Promise<{ ok: boolean; discovered: number; failed: number; disabled?: boolean }> {
  const contractId = arisanGatheringContract("scheduled");
  if (isLocalPreview || !contractId) return { ok: true, discovered: 0, failed: 0, disabled: true };
  if (!supabaseAdminConfigured()) return { ok: false, discovered: 0, failed: 1 };
  let discovered = 0;
  try {
    const server = new rpc.Server(RPC_URL, { timeout: TIMEOUT });
    const read = async (method: "scheduled_only" | "room_count") => {
      const tx = new TransactionBuilder(new Account(READ_SOURCE, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
        .addOperation(new Contract(contractId).call(method)).setTimeout(30).build();
      const result = await bounded(server.simulateTransaction(tx));
      if (!rpc.Api.isSimulationSuccess(result) || !result.result) throw Error("Discovery deployment unavailable");
      return scValToNative(result.result.retval) as unknown;
    };
    const [scheduledOnly, countValue] = await Promise.all([read("scheduled_only"), read("room_count")]);
    if (scheduledOnly !== true) throw Error("Scheduled-only deployment required");
    const count = integer(countValue, 0, 0xffff_ffff);
    const db = createSupabaseAdmin(), cursor = await bounded(Promise.resolve(db.rpc("arisan_scheduled_discovery_cursor", { p_contract: contractId })));
    if (cursor.error) throw Error("Discovery unavailable");
    let highwater = integer(cursor.data, 0, 0xffff_ffff);
    if (count < highwater) throw Error("Deployment reset requires operator review");
    while (highwater < count && discovered < 2) {
      const room = await readArisanNotificationRoom({ kind: "scheduled", roomId: highwater + 1 });
      await syncRoom(room);
      const advanced = await bounded(Promise.resolve(db.rpc("arisan_scheduled_discovery_advance", { p_contract: contractId, p_expected: highwater, p_next: highwater + 1 })));
      if (advanced.error || advanced.data !== true) throw Error("Discovery cursor changed");
      highwater++; discovered++;
    }
    return { ok: true, discovered, failed: 0 };
  } catch { return { ok: false, discovered, failed: 1 }; }
}
/** Called only by the secret-protected server cron route, never a user action.
 * DB revision locks and unique event keys make retries/concurrent workers safe. */
export async function dispatchArisanReminders(): Promise<{ ok: true; processed: number; enqueued: number; failed: number } | ArisanGatheringFailure> {
  if (isLocalPreview || !supabaseAdminConfigured()) return unavailable();
  try {
    const db = createSupabaseAdmin(), [jobs, watches] = await bounded(Promise.all([db.rpc("arisan_gathering_due_reminders", { p_limit: 10 }),
      db.from("arisan_room_notification_watches").select("contract_id,room_kind,room_id").order("last_checked_at", { ascending: true }).limit(10)]));
    if (jobs.error || watches.error || !Array.isArray(jobs.data)) return unavailable();
    let processed = 0, enqueued = 0, failed = 0;
    const reads = new Map<string, Promise<ArisanNotificationRoom>>();
    const fresh = (row: RecordValue) => {
      const scope = arisanGatheringScope({ kind: row.room_kind, roomId: Number(row.room_id) });
      if (!scope || arisanGatheringContract(scope.kind) !== row.contract_id) throw Error("Outdated deployment");
      const key = `${row.contract_id}:${scope.kind}:${scope.roomId}`;
      if (!reads.has(key)) reads.set(key, readArisanNotificationRoom(scope));
      return reads.get(key)!;
    };
    const tasks = [
      ...jobs.data.map((row: RecordValue) => async () => { try { const room = await fresh(row); const result = await bounded(Promise.resolve(db.rpc("arisan_gathering_reminder_enqueue", { p_job: row.id, p_contract: room.contractId, p_kind: room.kind, p_room: room.roomId, p_members: room.members }))); if (result.error || !Number.isSafeInteger(result.data)) throw Error("Reminder unavailable"); enqueued += result.data; processed++; } finally { await bounded(Promise.resolve(db.from("arisan_gathering_reminders").update({ last_attempt_at: new Date().toISOString() }).eq("id", row.id))); } }),
      ...(watches.data ?? []).map((row: RecordValue) => async () => { try { enqueued += await syncRoom(await fresh(row)); processed++; } finally { await bounded(Promise.resolve(db.from("arisan_room_notification_watches").update({ last_checked_at: new Date().toISOString() }).eq("contract_id", row.contract_id).eq("room_kind", row.room_kind).eq("room_id", row.room_id))); } }),
    ];
    // At most three concurrent room reads, ten jobs plus ten watches per run.
    let cursor = 0; const stopStartingAt = Date.now() + 30_000;
    await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, async () => { while (cursor < tasks.length && Date.now() < stopStartingAt) { const task = tasks[cursor++]; try { await task(); } catch { failed++; } } }));
    return { ok: true, processed, enqueued, failed };
  } catch { return unavailable(); }
}
