/** Browser-local preferences are presentation only. They never authorize a
 * deposit, reserve funds, or replace fresh contract state. */
export type ArisanFundingReminderScope = {
  contractId: string;
  roomId: number;
  viewer: string;
};

export type ArisanFundingReminderStatus = "Open" | "Active" | "Done" | "Dissolved";
export type FundingReminderStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type FundingReminderRead =
  | { ok: true; enabled: boolean }
  | { ok: false; reason: "invalid_scope" | "storage_unavailable" | "invalid_preference" };

const MAX_STROOPS = (1n << 127n) - 1n;
const MAX_UNIX_SECONDS = 253_402_300_799;

export function arisanFundingReminderKey(scope: ArisanFundingReminderScope): string | null {
  if (!/^C[A-Z2-7]{55}$/.test(scope.contractId) || !/^G[A-Z2-7]{55}$/.test(scope.viewer)
    || !Number.isSafeInteger(scope.roomId) || scope.roomId < 1) return null;
  return `salapi.arisan.funding-reminder.v1.${scope.contractId}.${scope.roomId}.${scope.viewer}`;
}

export function readArisanFundingReminder(storage: FundingReminderStorage | null, scope: ArisanFundingReminderScope): FundingReminderRead {
  const key = arisanFundingReminderKey(scope);
  if (!key) return { ok: false, reason: "invalid_scope" };
  if (!storage) return { ok: false, reason: "storage_unavailable" };
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { ok: true, enabled: false };
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || !Object.hasOwn(value, "version") || !Object.hasOwn(value, "enabled")
      || (value as { version: unknown }).version !== 1
      || (value as { enabled: unknown }).enabled !== true
      || Object.keys(value).length !== 2) return { ok: false, reason: "invalid_preference" };
    return { ok: true, enabled: true };
  } catch {
    return { ok: false, reason: "storage_unavailable" };
  }
}

/** Confirm the persisted value before the UI reports that opt-in/opt-out saved.
 * Opt-out removes this exact scope only, never another room or wallet. */
export function saveArisanFundingReminder(storage: FundingReminderStorage | null, scope: ArisanFundingReminderScope, enabled: boolean): boolean {
  const key = arisanFundingReminderKey(scope);
  if (!key || !storage || typeof enabled !== "boolean") return false;
  try {
    if (enabled) storage.setItem(key, JSON.stringify({ version: 1, enabled: true }));
    else storage.removeItem(key);
    const saved = readArisanFundingReminder(storage, scope);
    return saved.ok && saved.enabled === enabled;
  } catch { return false; }
}

function remainingValue(stroops: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,38})$/.test(stroops)) return null;
  const value = BigInt(stroops);
  return value <= MAX_STROOPS ? value : null;
}

function validTime(seconds: number): boolean {
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= MAX_UNIX_SECONDS;
}

export function fundingReminderPhase(status: ArisanFundingReminderStatus, remainingStroops: string, deadline: number, now: number): "suppressed" | "pending" | "overdue" | "invalid" {
  if (status !== "Open") return "suppressed";
  const remaining = remainingValue(remainingStroops);
  if (remaining === null || !validTime(deadline) || !validTime(now)) return "invalid";
  if (remaining === 0n) return "suppressed";
  return now >= deadline ? "overdue" : "pending";
}

export function formatFundingReminderXlm(stroops: string): string | null {
  const value = remainingValue(stroops);
  if (value === null) return null;
  const whole = value / 10_000_000n;
  const decimal = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return decimal ? `${whole}.${decimal}` : whole.toString();
}

export function formatFundingDeadlineUtc(seconds: number): string | null {
  return validTime(seconds) ? `${new Date(seconds * 1000).toISOString().slice(0, 19).replace("T", " ")} UTC` : null;
}

/** RFC 5545 TEXT escaping prevents new properties being injected through text. */
export function escapeFundingCalendarText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** Fold at 75 UTF-8 octets, without splitting a Unicode code point. The
 * continuation's leading space counts toward its own 75-octet limit. */
export function foldFundingCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  let result = "";
  let octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75) { result += "\r\n "; octets = 1; }
    result += character;
    octets += size;
  }
  return result;
}

function calendarTimestamp(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
}

export function buildArisanFundingCalendar(scope: ArisanFundingReminderScope, options: { deadline: number; remainingStroops: string; now: number; status: ArisanFundingReminderStatus }): { contents: string; filename: string; reminderAt: number } | null {
  if (!arisanFundingReminderKey(scope) || fundingReminderPhase(options.status, options.remainingStroops, options.deadline, options.now) !== "pending") return null;
  // One day before the deadline where possible; otherwise one second from now.
  // A calendar import is never described as a scheduled/received notification.
  const reminderAt = Math.max(options.now + 1, options.deadline - 86_400);
  if (reminderAt >= options.deadline) return null;
  const remaining = formatFundingReminderXlm(options.remainingStroops);
  const description = `Remaining deposit: ${remaining} Testnet XLM. Funding deadline: ${formatFundingDeadlineUtc(options.deadline)}. Open Salapi Arisan room ${scope.roomId} and review its current terms and remaining balance before paying a voluntary installment. No automatic debit. Testnet tokens have no monetary value. This event is a reminder, not a payment authorization. Remove the imported event yourself if the room closes or you finish funding.`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Salapi//Arisan funding reminder//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:salapi-arisan-${scope.contractId.slice(-12)}-${scope.roomId}-${options.deadline}@salapi.app`,
    `DTSTAMP:${calendarTimestamp(options.now)}`,
    `DTSTART:${calendarTimestamp(reminderAt)}`,
    `DTEND:${calendarTimestamp(Math.min(reminderAt + 300, options.deadline))}`,
    `SUMMARY:${escapeFundingCalendarText(`Review Salapi Arisan room ${scope.roomId} deposit`)}`,
    `DESCRIPTION:${escapeFundingCalendarText(description)}`,
    "STATUS:CONFIRMED", "TRANSP:TRANSPARENT", "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0S",
    `DESCRIPTION:${escapeFundingCalendarText(`Review your remaining Testnet deposit in Salapi Arisan room ${scope.roomId}. No automatic debit.`)}`,
    "END:VALARM", "END:VEVENT", "END:VCALENDAR",
  ];
  return { contents: lines.map(foldFundingCalendarLine).join("\r\n") + "\r\n", filename: `salapi-arisan-${scope.roomId}-funding.ics`, reminderAt };
}
