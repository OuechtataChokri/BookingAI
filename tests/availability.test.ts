import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeAvailableSlots, type AvailabilityHours, type AvailabilityStaff } from "../lib/booking/availability.ts";
import { isValidDateString, toLocalDateString, toLocalTimeString, zonedTimeToUtc } from "../lib/time.ts";

const hours: AvailabilityHours[] = [
  { day_of_week: 0, is_closed: true, open_time: "09:00", close_time: "18:00" },
  { day_of_week: 1, is_closed: false, open_time: "09:00", close_time: "12:00" },
  { day_of_week: 2, is_closed: false, open_time: "09:00", close_time: "18:00" },
  { day_of_week: 3, is_closed: false, open_time: "09:00", close_time: "18:00" },
  { day_of_week: 4, is_closed: false, open_time: "09:00", close_time: "18:00" },
  { day_of_week: 5, is_closed: false, open_time: "09:00", close_time: "18:00" },
  { day_of_week: 6, is_closed: false, open_time: "09:00", close_time: "14:00" },
];

const staff: AvailabilityStaff[] = [
  { id: "st-1", name: "Karim", is_active: true, working_days: [1, 2, 3, 4, 5, 6], work_start: null, work_end: null, service_ids: ["svc-cut"] },
  { id: "st-2", name: "Yasmine", is_active: true, working_days: [2, 3, 4, 5, 6], work_start: "10:00", work_end: "12:00", service_ids: [] },
];

describe("time helpers", () => {
  it("converts local Africa/Tunis time (UTC+1) to UTC and back", () => {
    const utc = zonedTimeToUtc("2026-11-16", "09:00", "Africa/Tunis");
    assert.equal(utc.toISOString(), "2026-11-16T08:00:00.000Z");
    assert.equal(toLocalDateString(utc, "Africa/Tunis"), "2026-11-16");
    assert.equal(toLocalTimeString(utc, "Africa/Tunis"), "09:00");
  });

  it("validates calendar dates strictly", () => {
    assert.equal(isValidDateString("2026-02-28"), true);
    assert.equal(isValidDateString("2026-02-30"), false);
    assert.equal(isValidDateString("not-a-date"), false);
  });
});

describe("computeAvailableSlots", () => {
  // 2026-11-15 is Sunday; 2026-11-16 is Monday; 2026-11-17 is Tuesday
  const now = new Date("2026-11-15T12:00:00.000Z");

  it("returns no slots when the business is closed", () => {
    const slots = computeAvailableSlots({
      date: "2026-11-15",
      timeZone: "Africa/Tunis",
      serviceId: "svc-cut",
      durationMinutes: 30,
      intervalMinutes: 30,
      leadMinutes: 60,
      horizonDays: 30,
      hours,
      staff,
      busy: [],
      now,
    });
    assert.equal(slots.length, 0);
  });

  it("excludes overlapping bookings and respects service duration", () => {
    const busyStart = zonedTimeToUtc("2026-11-16", "09:30", "Africa/Tunis");
    const busyEnd = zonedTimeToUtc("2026-11-16", "10:00", "Africa/Tunis");

    const slots = computeAvailableSlots({
      date: "2026-11-16", // Monday: only Karim works, 09:00-12:00
      timeZone: "Africa/Tunis",
      serviceId: "svc-cut",
      durationMinutes: 60,
      intervalMinutes: 30,
      leadMinutes: 60,
      horizonDays: 30,
      hours,
      staff,
      busy: [{ staff_id: "st-1", starts_at: busyStart, ends_at: busyEnd }],
      now,
    });

    // 09:00 (09:00-10:00) overlaps 09:30-10:00
    // 09:30 (09:30-10:30) overlaps 09:30-10:00
    // 10:00 (10:00-11:00) free!
    // 10:30 (10:30-11:30) free!
    // 11:00 (11:00-12:00) free!
    // 11:30 would end at 12:30 > 12:00 close
    assert.deepEqual(
      slots.map((s) => s.start_local),
      ["10:00", "10:30", "11:00"],
    );
  });

  it("respects staff service eligibility and individual shift hours", () => {
    const slots = computeAvailableSlots({
      date: "2026-11-17", // Tuesday
      timeZone: "Africa/Tunis",
      serviceId: "svc-color", // Karim only does svc-cut; Yasmine does all
      durationMinutes: 60,
      intervalMinutes: 30,
      leadMinutes: 60,
      horizonDays: 30,
      hours,
      staff,
      busy: [],
      now,
    });

    assert.deepEqual(
      slots.map((s) => [s.start_local, s.staff_name]),
      [
        ["10:00", "Yasmine"],
        ["10:30", "Yasmine"],
        ["11:00", "Yasmine"],
      ],
    );
  });

  it("enforces booking lead time and horizon", () => {
    const sameMorning = zonedTimeToUtc("2026-11-16", "09:15", "Africa/Tunis");
    const slots = computeAvailableSlots({
      date: "2026-11-16",
      timeZone: "Africa/Tunis",
      serviceId: "svc-cut",
      durationMinutes: 30,
      intervalMinutes: 30,
      leadMinutes: 60, // earliest = 10:15
      horizonDays: 30,
      hours,
      staff,
      busy: [],
      now: sameMorning,
    });
    assert.deepEqual(
      slots.map((s) => s.start_local),
      ["10:30", "11:00", "11:30"],
    );
  });
});
