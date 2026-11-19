/**
 * Pure availability calculation (no database access) so it can be unit tested.
 * The database function `book_appointment` re-checks every rule atomically –
 * this function is only used to PROPOSE free slots.
 */
import { timeToMinutes, minutesToTime, weekdayOfDate, zonedTimeToUtc } from "../time.ts";

export interface AvailabilityHours {
  day_of_week: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
}

export interface AvailabilityStaff {
  id: string;
  name: string;
  is_active: boolean;
  working_days: number[];
  work_start: string | null;
  work_end: string | null;
  /** empty / undefined = can perform every service */
  service_ids?: string[];
}

export interface BusyInterval {
  staff_id: string;
  starts_at: string | Date;
  ends_at: string | Date;
}

export interface SlotInput {
  date: string; // YYYY-MM-DD (business local date)
  timeZone: string;
  serviceId: string;
  durationMinutes: number;
  intervalMinutes: number;
  leadMinutes: number;
  horizonDays: number;
  hours: AvailabilityHours[];
  staff: AvailabilityStaff[];
  busy: BusyInterval[];
  staffId?: string | null;
  now?: Date;
}

export interface Slot {
  start_local: string; // HH:MM in business timezone
  starts_at: string; // ISO UTC
  ends_at: string; // ISO UTC
  staff_id: string;
  staff_name: string;
}

export function staffCanPerform(staff: AvailabilityStaff, serviceId: string): boolean {
  return !staff.service_ids || staff.service_ids.length === 0 || staff.service_ids.includes(serviceId);
}

export function computeAvailableSlots(input: SlotInput): Slot[] {
  const now = input.now ?? new Date();
  const dow = weekdayOfDate(input.date);
  const hours = input.hours.find((h) => h.day_of_week === dow);
  if (!hours || hours.is_closed) return [];

  const earliest = now.getTime() + input.leadMinutes * 60_000;
  const latest = now.getTime() + input.horizonDays * 86_400_000;

  const openMin = timeToMinutes(hours.open_time);
  const closeMin = timeToMinutes(hours.close_time);

  const candidates = input.staff.filter(
    (s) =>
      s.is_active &&
      (!input.staffId || s.id === input.staffId) &&
      s.working_days.includes(dow) &&
      staffCanPerform(s, input.serviceId),
  );

  const busyByStaff = new Map<string, Array<[number, number]>>();
  for (const b of input.busy) {
    const list = busyByStaff.get(b.staff_id) ?? [];
    list.push([new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()]);
    busyByStaff.set(b.staff_id, list);
  }

  const byTime = new Map<string, Slot>();
  const loadByStaff = new Map<string, number>();
  for (const s of candidates) loadByStaff.set(s.id, busyByStaff.get(s.id)?.length ?? 0);
  // Least-busy staff first so "any staff" spreads bookings fairly.
  candidates.sort((a, b) => (loadByStaff.get(a.id) ?? 0) - (loadByStaff.get(b.id) ?? 0));

  const step = Math.max(5, input.intervalMinutes);
  for (const s of candidates) {
    const start = Math.max(openMin, s.work_start ? timeToMinutes(s.work_start) : openMin);
    const end = Math.min(closeMin, s.work_end ? timeToMinutes(s.work_end) : closeMin);
    const busy = busyByStaff.get(s.id) ?? [];

    for (let t = start; t + input.durationMinutes <= end; t += step) {
      const local = minutesToTime(t);
      if (byTime.has(local)) continue;
      const startUtc = zonedTimeToUtc(input.date, local, input.timeZone).getTime();
      const endUtc = startUtc + input.durationMinutes * 60_000;
      if (startUtc < earliest || startUtc > latest) continue;
      if (busy.some(([bs, be]) => startUtc < be && endUtc > bs)) continue;
      byTime.set(local, {
        start_local: local,
        starts_at: new Date(startUtc).toISOString(),
        ends_at: new Date(endUtc).toISOString(),
        staff_id: s.id,
        staff_name: s.name,
      });
    }
  }

  return [...byTime.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
