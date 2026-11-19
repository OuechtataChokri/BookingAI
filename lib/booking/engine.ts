import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { computeAvailableSlots, type Slot } from "@/lib/booking/availability";
import { addDaysToDateString, isValidDateString, toLocalDateString, zonedTimeToUtc } from "@/lib/time";
import type { Business, BusinessHours, Service, Staff } from "@/lib/types";

/**
 * Booking engine. The SAME functions serve the dashboard (user session client,
 * protected by RLS) and the AI assistant (service-role client, business id
 * resolved from the WhatsApp phone_number_id – never from the customer).
 *
 * The database function `book_appointment` is the final authority: it
 * re-validates hours / staff / service and uses an exclusion constraint, so
 * two simultaneous requests can never double-book a staff member.
 */

export type BookingErrorCode =
  | "invalid_input"
  | "service_not_found"
  | "staff_not_found"
  | "customer_not_found"
  | "business_not_found"
  | "outside_business_hours"
  | "too_soon"
  | "too_far"
  | "slot_taken"
  | "staff_unavailable"
  | "no_staff_available"
  | "appointment_not_found"
  | "cannot_cancel"
  | "forbidden"
  | "internal_error";

const ERROR_MESSAGES: Record<BookingErrorCode, string> = {
  invalid_input: "The booking details are not valid.",
  service_not_found: "This service does not exist or is not available.",
  staff_not_found: "This staff member does not exist.",
  customer_not_found: "Customer not found.",
  business_not_found: "Business not found.",
  outside_business_hours: "This time is outside the opening hours.",
  too_soon: "This time is too soon to book. Please choose a later slot.",
  too_far: "This date is too far in the future.",
  slot_taken: "This slot has just been taken. Please choose another time.",
  staff_unavailable: "This staff member is not available at that time.",
  no_staff_available: "No staff member is available at that time.",
  appointment_not_found: "Appointment not found.",
  cannot_cancel: "This appointment cannot be cancelled (already cancelled, completed, or in the past).",
  forbidden: "You do not have permission to do this.",
  internal_error: "Something went wrong. Please try again.",
};

export const bookingErrorMessage = (code: string) => ERROR_MESSAGES[code as BookingErrorCode] ?? ERROR_MESSAGES.internal_error;

export interface BookingConfig {
  business: Business;
  hours: BusinessHours[];
  staff: Staff[];
}

export async function loadBookingConfig(sb: SupabaseClient, businessId: string): Promise<BookingConfig | null> {
  const [biz, hours, staff] = await Promise.all([
    sb.from("businesses").select("*").eq("id", businessId).maybeSingle(),
    sb.from("business_hours").select("*").eq("business_id", businessId),
    sb.from("staff").select("*, staff_services(service_id)").eq("business_id", businessId).eq("is_active", true),
  ]);
  if (biz.error || !biz.data) return null;
  return {
    business: biz.data as Business,
    hours: (hours.data ?? []) as BusinessHours[],
    staff: (staff.data ?? []).map((row) => {
      const { staff_services, ...rest } = row as Staff & { staff_services: Array<{ service_id: string }> };
      return { ...rest, service_ids: staff_services.map((s) => s.service_id) };
    }),
  };
}

const slotsSchema = z.object({
  serviceId: z.uuid(),
  date: z.string().refine(isValidDateString, "Invalid date, expected YYYY-MM-DD"),
  staffId: z.uuid().nullish(),
});

export type SlotsResult =
  | { ok: true; date: string; timezone: string; service: Pick<Service, "id" | "name" | "duration_minutes" | "price_cents">; slots: Slot[] }
  | { ok: false; error: BookingErrorCode; message: string };

const fail = (error: BookingErrorCode): { ok: false; error: BookingErrorCode; message: string } => ({
  ok: false,
  error,
  message: bookingErrorMessage(error),
});

export async function getAvailableSlots(
  sb: SupabaseClient,
  businessId: string,
  input: { serviceId: string; date: string; staffId?: string | null },
  now: Date = new Date(),
): Promise<SlotsResult> {
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const { serviceId, date, staffId } = parsed.data;

  const config = await loadBookingConfig(sb, businessId);
  if (!config) return fail("business_not_found");
  const { business } = config;

  const { data: service } = await sb
    .from("services")
    .select("id, name, duration_minutes, price_cents")
    .eq("id", serviceId)
    .eq("business_id", businessId)
    .eq("is_active", true)
    .maybeSingle();
  if (!service) return fail("service_not_found");

  if (staffId && !config.staff.some((s) => s.id === staffId)) return fail("staff_not_found");

  const dayStart = zonedTimeToUtc(date, "00:00", business.timezone);
  const dayEnd = zonedTimeToUtc(addDaysToDateString(date, 1), "00:00", business.timezone);

  const { data: busy, error } = await sb
    .from("appointments")
    .select("staff_id, starts_at, ends_at")
    .eq("business_id", businessId)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", dayEnd.toISOString())
    .gt("ends_at", dayStart.toISOString());
  if (error) return fail("internal_error");

  const slots = computeAvailableSlots({
    date,
    timeZone: business.timezone,
    serviceId,
    durationMinutes: service.duration_minutes,
    intervalMinutes: business.slot_interval_minutes,
    leadMinutes: business.booking_lead_minutes,
    horizonDays: business.booking_horizon_days,
    hours: config.hours,
    staff: config.staff,
    busy: busy ?? [],
    staffId,
    now,
  });

  return { ok: true, date, timezone: business.timezone, service, slots };
}

const bookSchema = z.object({
  customerId: z.uuid(),
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  staffId: z.uuid().nullish(),
  source: z.enum(["dashboard", "whatsapp", "messenger"]),
  notes: z.string().max(1000).nullish(),
});

export type BookResult =
  | {
      ok: true;
      appointmentId: string;
      staffId: string;
      staffName: string;
      serviceName: string;
      startsAt: string;
      endsAt: string;
      priceCents: number;
    }
  | { ok: false; error: BookingErrorCode; message: string };

export async function bookAppointment(
  sb: SupabaseClient,
  businessId: string,
  input: z.input<typeof bookSchema>,
): Promise<BookResult> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");
  const v = parsed.data;

  const { data, error } = await sb.rpc("book_appointment", {
    p_business_id: businessId,
    p_customer_id: v.customerId,
    p_service_id: v.serviceId,
    p_starts_at: new Date(v.startsAt).toISOString(),
    p_staff_id: v.staffId ?? null,
    p_source: v.source,
    p_notes: v.notes ?? null,
  });
  if (error || !data) return fail("internal_error");

  const res = data as Record<string, unknown>;
  if (res.ok !== true) return fail((res.error as BookingErrorCode) ?? "internal_error");

  // Only reported as success after the row exists in the database.
  return {
    ok: true,
    appointmentId: res.appointment_id as string,
    staffId: res.staff_id as string,
    staffName: res.staff_name as string,
    serviceName: res.service_name as string,
    startsAt: res.starts_at as string,
    endsAt: res.ends_at as string,
    priceCents: res.price_cents as number,
  };
}

export type CancelResult =
  | { ok: true; appointmentId: string; startsAt: string }
  | { ok: false; error: BookingErrorCode; message: string };

export async function cancelAppointment(
  sb: SupabaseClient,
  businessId: string,
  input: { appointmentId: string; customerId?: string; reason?: string; allowPast?: boolean },
): Promise<CancelResult> {
  if (!z.uuid().safeParse(input.appointmentId).success) return fail("invalid_input");

  let q = sb
    .from("appointments")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancellation_reason: input.reason?.slice(0, 500) ?? null })
    .eq("id", input.appointmentId)
    .eq("business_id", businessId)
    .in("status", ["pending", "confirmed"]);
  if (input.customerId) q = q.eq("customer_id", input.customerId);
  if (!input.allowPast) q = q.gt("starts_at", new Date().toISOString());

  const { data, error } = await q.select("id, starts_at");
  if (error) return fail("internal_error");
  if (!data || data.length === 0) {
    // Distinguish "not found / not yours" from "not cancellable".
    let probe = sb.from("appointments").select("id").eq("id", input.appointmentId).eq("business_id", businessId);
    if (input.customerId) probe = probe.eq("customer_id", input.customerId);
    const { data: exists } = await probe.maybeSingle();
    return fail(exists ? "cannot_cancel" : "appointment_not_found");
  }
  return { ok: true, appointmentId: data[0].id as string, startsAt: data[0].starts_at as string };
}

/** Today's date in the business timezone (YYYY-MM-DD). */
export const businessToday = (timezone: string, now = new Date()) => toLocalDateString(now, timezone);
