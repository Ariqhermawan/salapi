export type ArisanScheduleChoice = "Weekly" | "Monthly" | "Custom";
export type ArisanSchedule = {
  intervalDays: number;
  firstDrawAt: number;
  fundingDeadlineAt: number;
  timeZone: string;
};
export type ArisanScheduleLimits = {
  minIntervalDays: number;
  maxIntervalDays: number;
  firstCommitWindow: number;
  revealWindow: number;
  maxFirstDrawDelay: number;
};
export const ARISAN_DAY_SECONDS = 86_400;
export const ARISAN_SCHEDULE_TIME_ZONES = ["UTC", "Asia/Jakarta", "Asia/Manila", "Asia/Ho_Chi_Minh", "Asia/Singapore", "Europe/London", "America/New_York"] as const;

export function arisanIntervalDays(choice: ArisanScheduleChoice, custom: unknown): number | null {
  if (choice === "Weekly") return 7;
  if (choice === "Monthly") return 30;
  if (choice !== "Custom") return null;
  const value = typeof custom === "string" && /^\d{1,3}$/.test(custom) ? Number(custom) : custom;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 365 ? value : null;
}

export function validArisanTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 80) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return true; }
  catch { return false; }
}

function dateParts(formatter: Intl.DateTimeFormat, time: number) {
  const parts = formatter.formatToParts(time);
  const number = (kind: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === kind)?.value);
  return [number("year"), number("month"), number("day"), number("hour"), number("minute")];
}

/** Resolve a wall-clock date in the explicitly selected IANA timezone. DST gaps
 * and repeated/ambiguous times are rejected instead of silently shifting time. */
export function parseArisanZonedDateTime(date: string, time: string, timeZone: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !validArisanTimeZone(timeZone)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const checked = new Date(target);
  if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) return null;
  const wanted = [year, month, day, hour, minute];
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const offsets = new Set<number>();
  for (const hours of [-24, -12, 0, 12, 24]) {
    const probe = target + hours * 3_600_000;
    const [y, m, d, h, min] = dateParts(formatter, probe);
    offsets.add(Date.UTC(y, m - 1, d, h, min) - probe);
  }
  const matches = [...offsets].map(offset => target - offset)
    .filter(candidate => dateParts(formatter, candidate).every((part, index) => part === wanted[index]));
  return matches.length === 1 ? matches[0] / 1000 : null;
}

export type ArisanScheduleError = "interval" | "timezone" | "date" | "past" | "funding-order" | "draw-window" | "too-far" | "limits";
export function validateArisanSchedule(schedule: ArisanSchedule, now: number, limits: ArisanScheduleLimits): ArisanScheduleError | null {
  if (!limits || ![limits.minIntervalDays, limits.maxIntervalDays, limits.firstCommitWindow, limits.revealWindow, limits.maxFirstDrawDelay].every(value => Number.isSafeInteger(value) && value >= 0)
    || limits.minIntervalDays < 1 || limits.maxIntervalDays > 365 || limits.minIntervalDays > limits.maxIntervalDays) return "limits";
  if (!Number.isInteger(schedule.intervalDays) || schedule.intervalDays < limits.minIntervalDays || schedule.intervalDays > limits.maxIntervalDays) return "interval";
  if (!validArisanTimeZone(schedule.timeZone)) return "timezone";
  if (![schedule.firstDrawAt, schedule.fundingDeadlineAt, now].every(value => Number.isSafeInteger(value) && value > 0)) return "date";
  if (schedule.fundingDeadlineAt <= now || schedule.firstDrawAt <= now) return "past";
  if (schedule.fundingDeadlineAt >= schedule.firstDrawAt) return "funding-order";
  if (schedule.firstDrawAt - schedule.fundingDeadlineAt < limits.firstCommitWindow + limits.revealWindow) return "draw-window";
  if (schedule.firstDrawAt - now > limits.maxFirstDrawDelay) return "too-far";
  return null;
}

export function formatArisanScheduleTime(seconds: number, timeZone: string, locale = "en-US"): string {
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || !validArisanTimeZone(timeZone)) return "Unavailable";
  return `${new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(seconds * 1000)} (${timeZone})`;
}

export function arisanScheduleCountdown(seconds: number): string {
  const remaining = Math.max(0, Math.floor(seconds));
  if (remaining === 0) return "0s";
  const days = Math.floor(remaining / ARISAN_DAY_SECONDS);
  const hours = Math.floor(remaining % ARISAN_DAY_SECONDS / 3600);
  const minutes = Math.floor(remaining % 3600 / 60);
  return days ? `${days}d ${hours}h ${minutes}m` : hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remaining % 60}s` : `${remaining}s`;
}
