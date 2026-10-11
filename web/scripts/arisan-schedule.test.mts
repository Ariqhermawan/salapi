import test from "node:test";
import assert from "node:assert/strict";
import { arisanIntervalDays, parseArisanZonedDateTime, validateArisanSchedule, validArisanTimeZone, arisanScheduleCountdown, formatArisanScheduleTime } from "../lib/arisan-schedule.ts";

const now = Date.UTC(2026, 9, 11) / 1000;
const limits = { minIntervalDays: 1, maxIntervalDays: 365, firstCommitWindow: 86400, revealWindow: 86400, maxFirstDrawDelay: 366 * 86400 };
const schedule = { intervalDays: 7, firstDrawAt: now + 4 * 86400, fundingDeadlineAt: now + 86400, timeZone: "Asia/Jakarta" };

test("weekly and monthly are exact 7 and 30 days; custom only accepts integers 1-365", () => {
  assert.equal(arisanIntervalDays("Weekly", 3), 7);
  assert.equal(arisanIntervalDays("Monthly", 31), 30);
  for (const value of [1, "2", 365, "365"]) assert.ok(arisanIntervalDays("Custom", value));
  for (const value of [0, -1, 366, "1.5", 1.5, NaN, Infinity, "", "1e2", null]) assert.equal(arisanIntervalDays("Custom", value), null);
});

test("date-time converts using selected zone, not device timezone", () => {
  assert.equal(parseArisanZonedDateTime("2026-10-15", "19:30", "Asia/Jakarta"), Date.UTC(2026, 9, 15, 12, 30) / 1000);
  assert.equal(parseArisanZonedDateTime("2026-10-15", "19:30", "Asia/Manila"), Date.UTC(2026, 9, 15, 11, 30) / 1000);
  assert.equal(parseArisanZonedDateTime("2026-10-15", "00:00", "UTC"), Date.UTC(2026, 9, 15) / 1000);
  assert.equal(parseArisanZonedDateTime("2026-10-15", "12:45", "Asia/Kathmandu"), Date.UTC(2026, 9, 15, 7) / 1000);
});

test("invalid dates, timezones, daylight-saving gaps and ambiguous repeated hours fail closed", () => {
  assert.equal(parseArisanZonedDateTime("2026-02-30", "19:30", "UTC"), null);
  assert.equal(parseArisanZonedDateTime("2026-10-15", "24:00", "UTC"), null);
  assert.equal(parseArisanZonedDateTime("2026-10-15", "19:30", "Bogus/Zone"), null);
  assert.equal(parseArisanZonedDateTime("2026-03-08", "02:30", "America/New_York"), null);
  assert.equal(parseArisanZonedDateTime("2026-11-01", "01:30", "America/New_York"), null);
  assert.equal(validArisanTimeZone("Asia/Jakarta"), true);
  assert.equal(validArisanTimeZone("UTC<script>"), false);
});

test("funding closes first with enough contract commit+reveal time before payout", () => {
  assert.equal(validateArisanSchedule(schedule, now, limits), null);
  assert.equal(validateArisanSchedule({ ...schedule, firstDrawAt: schedule.fundingDeadlineAt + 2 * 86400 }, now, limits), null);
  assert.equal(validateArisanSchedule({ ...schedule, firstDrawAt: schedule.fundingDeadlineAt + 2 * 86400 - 1 }, now, limits), "draw-window");
  assert.equal(validateArisanSchedule({ ...schedule, fundingDeadlineAt: schedule.firstDrawAt }, now, limits), "funding-order");
  assert.equal(validateArisanSchedule({ ...schedule, fundingDeadlineAt: now }, now, limits), "past");
  assert.equal(validateArisanSchedule({ ...schedule, firstDrawAt: now + limits.maxFirstDrawDelay + 1 }, now, limits), "too-far");
});

test("invalid numeric schedules and unverified limits do not permit creation", () => {
  assert.equal(validateArisanSchedule({ ...schedule, intervalDays: 1.1 }, now, limits), "interval");
  assert.equal(validateArisanSchedule({ ...schedule, firstDrawAt: Infinity }, now, limits), "date");
  assert.equal(validateArisanSchedule({ ...schedule, timeZone: "invalid" }, now, limits), "timezone");
  assert.equal(validateArisanSchedule(schedule, now, { ...limits, maxIntervalDays: 366 }), "limits");
});

test("countdown never invents a payable action when zero and date includes explicit timezone", () => {
  assert.equal(arisanScheduleCountdown(86461), "1d 0h 1m");
  assert.equal(arisanScheduleCountdown(-4), "0s");
  assert.match(formatArisanScheduleTime(schedule.firstDrawAt, schedule.timeZone), /Asia\/Jakarta/);
  assert.equal(formatArisanScheduleTime(0, "UTC"), "Unavailable");
});
