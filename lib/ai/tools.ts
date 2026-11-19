import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ToolDeclaration, ToolExecutor } from "@/lib/ai/provider";
import { bookAppointment, cancelAppointment, getAvailableSlots } from "@/lib/booking/engine";
import { isValidDateString, toLocalDateString, toLocalTimeString } from "@/lib/time";
import { logError } from "@/lib/logger";
import { DAY_NAMES, formatMoney, normalizePhone } from "@/lib/utils";
import type { Business } from "@/lib/types";

/**
 * Backend functions exposed to Gemini via function calling.
 *
 * SECURITY MODEL
 *  - `business` and `customer` come from the server (WhatsApp phone_number_id +
 *    sender phone). They are NEVER function arguments, so the model (or a
 *    prompt-injecting customer) cannot switch tenant or impersonate another customer.
 *  - Every argument is validated with zod before use.
 *  - Every query is scoped by business_id (and customer_id where relevant).
 *  - Availability and booking results come from the booking engine / database.
 *    The model only relays them.
 */

export interface ToolContext {
  sb: SupabaseClient;
  business: Business;
  customer: { id: string; name: string | null };
  conversationId: string;
  channel?: "whatsapp" | "messenger";
  now?: Date;
}

const uuid = z.uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM (24h)");
const date = z.string().refine(isValidDateString, "date must be YYYY-MM-DD");

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: "get_services",
    description: "List the services this business offers, with id, duration and price. Call this before discussing or booking any service.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_business_hours",
    description: "Get the weekly opening hours, the business timezone and the current local date/time.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_available_slots",
    description:
      "Get the REAL free appointment times for a service on a given date, computed by the backend. You must call this before proposing any time. Never invent times.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "Service id from get_services" },
        date: { type: "string", description: "Local date in YYYY-MM-DD format" },
        staff_id: { type: "string", description: "Optional staff id if the customer asked for a specific person" },
      },
      required: ["service_id", "date"],
    },
  },
  {
    name: "create_appointment",
    description:
      "Book an appointment for the current customer. Only call after the customer clearly confirmed the service, date and time. The time must be one returned by get_available_slots. Returns ok=true only if the booking was really saved.",
    parameters: {
      type: "object",
      properties: {
        service_id: { type: "string", description: "Service id from get_services" },
        date: { type: "string", description: "Local date YYYY-MM-DD" },
        time: { type: "string", description: "Local start time HH:MM (24h), taken from get_available_slots" },
        staff_id: { type: "string", description: "Optional staff id" },
        customer_name: { type: "string", description: "Customer's name if they gave it" },
        customer_phone: { type: "string", description: "Optional customer phone number if they shared it" },
      },
      required: ["service_id", "date", "time"],
    },
  },
  {
    name: "get_my_appointments",
    description: "List the current customer's upcoming appointments (needed to find the id to cancel).",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "cancel_appointment",
    description: "Cancel one of the current customer's upcoming appointments. Only call after the customer clearly confirmed which appointment to cancel.",
    parameters: {
      type: "object",
      properties: { appointment_id: { type: "string", description: "Appointment id from get_my_appointments" } },
      required: ["appointment_id"],
    },
  },
  {
    name: "request_human_support",
    description: "Hand the conversation over to a human staff member (complaints, special requests, anything you cannot handle).",
    parameters: {
      type: "object",
      properties: { reason: { type: "string", description: "Short reason for the handover" } },
      required: ["reason"],
    },
  },
];

type Handler = (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

const invalid = (err: z.ZodError) => ({ ok: false, error: "invalid_arguments", message: err.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ") });

export function createBookingTools(ctx: ToolContext): ToolExecutor {
  const { sb, business, customer } = ctx;
  const tz = business.timezone;
  const now = () => ctx.now ?? new Date();

  const handlers: Record<string, Handler> = {
    async get_services() {
      const { data, error } = await sb
        .from("services")
        .select("id, name, description, duration_minutes, price_cents")
        .eq("business_id", business.id)
        .eq("is_active", true)
        .order("name");
      if (error) return { ok: false, error: "internal_error" };
      return {
        ok: true,
        currency: business.currency,
        services: (data ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          duration_minutes: s.duration_minutes,
          price: formatMoney(s.price_cents, business.currency),
        })),
      };
    },

    async get_business_hours() {
      const { data, error } = await sb.from("business_hours").select("day_of_week, is_closed, open_time, close_time").eq("business_id", business.id).order("day_of_week");
      if (error) return { ok: false, error: "internal_error" };
      const n = now();
      return {
        ok: true,
        timezone: tz,
        today: toLocalDateString(n, tz),
        today_weekday: DAY_NAMES[new Date(`${toLocalDateString(n, tz)}T12:00:00Z`).getUTCDay()],
        current_local_time: toLocalTimeString(n, tz),
        hours: (data ?? []).map((h) => ({
          day: DAY_NAMES[h.day_of_week as number],
          open: h.is_closed ? null : (h.open_time as string).slice(0, 5),
          close: h.is_closed ? null : (h.close_time as string).slice(0, 5),
          closed: h.is_closed,
        })),
        address: business.address,
        phone: business.phone,
      };
    },

    async get_available_slots(args) {
      const parsed = z.object({ service_id: uuid, date, staff_id: uuid.nullish() }).safeParse(args);
      if (!parsed.success) return invalid(parsed.error);
      const res = await getAvailableSlots(sb, business.id, { serviceId: parsed.data.service_id, date: parsed.data.date, staffId: parsed.data.staff_id ?? null }, now());
      if (!res.ok) return { ok: false, error: res.error, message: res.message };
      return {
        ok: true,
        date: res.date,
        timezone: res.timezone,
        service: { id: res.service.id, name: res.service.name, duration_minutes: res.service.duration_minutes },
        total_slots: res.slots.length,
        // Only real, bookable times. Capped to keep the answer short.
        slots: res.slots.slice(0, 30).map((s) => ({ time: s.start_local, staff_id: s.staff_id, staff_name: s.staff_name })),
        note: res.slots.length === 0 ? "No free slots on this date. Offer another date." : undefined,
      };
    },

    async create_appointment(args) {
      const parsed = z
        .object({
          service_id: uuid,
          date,
          time,
          staff_id: uuid.nullish(),
          customer_name: z.string().trim().max(120).nullish(),
          customer_phone: z.string().trim().max(32).nullish(),
        })
        .safeParse(args);
      if (!parsed.success) return invalid(parsed.error);
      const v = parsed.data;

      // 1) The requested time MUST be one of the backend-computed free slots.
      const avail = await getAvailableSlots(sb, business.id, { serviceId: v.service_id, date: v.date, staffId: v.staff_id ?? null }, now());
      if (!avail.ok) return { ok: false, error: avail.error, message: avail.message };
      const slot = avail.slots.find((s) => s.start_local === v.time);
      if (!slot) {
        return {
          ok: false,
          error: "slot_not_available",
          message: "That time is not available. Offer one of the alternatives.",
          alternatives: avail.slots.slice(0, 8).map((s) => s.start_local),
        };
      }

      // 2) Atomic booking in the database (re-validates everything, prevents overlaps).
      const booked = await bookAppointment(sb, business.id, {
        customerId: customer.id,
        serviceId: v.service_id,
        startsAt: slot.starts_at,
        staffId: v.staff_id ?? null,
        source: ctx.channel ?? "messenger",
      });
      if (!booked.ok) {
        return { ok: false, error: booked.error, message: booked.message };
      }

      const updates: Record<string, string> = {};
      if (v.customer_name && !customer.name) updates.name = v.customer_name;
      if (v.customer_phone) {
        const cleanPhone = normalizePhone(v.customer_phone);
        if (/^[0-9]{6,20}$/.test(cleanPhone)) updates.phone = cleanPhone;
      }
      if (Object.keys(updates).length > 0) {
        await sb.from("customers").update(updates).eq("id", customer.id).eq("business_id", business.id);
      }

      const start = new Date(booked.startsAt);
      const end = new Date(booked.endsAt);
      return {
        ok: true,
        message: "Appointment saved in the database.",
        appointment: {
          id: booked.appointmentId,
          service: booked.serviceName,
          staff: booked.staffName,
          date: toLocalDateString(start, tz),
          start_time: toLocalTimeString(start, tz),
          end_time: toLocalTimeString(end, tz),
          price: formatMoney(booked.priceCents, business.currency),
        },
      };
    },

    async get_my_appointments() {
      const { data, error } = await sb
        .from("appointments")
        .select("id, starts_at, ends_at, status, service:services(name), staff:staff(name)")
        .eq("business_id", business.id)
        .eq("customer_id", customer.id)
        .in("status", ["pending", "confirmed"])
        .gt("starts_at", now().toISOString())
        .order("starts_at")
        .limit(10);
      if (error) return { ok: false, error: "internal_error" };
      return {
        ok: true,
        appointments: (data ?? []).map((a) => {
          const s = new Date(a.starts_at as string);
          const svc = a.service as unknown as { name: string } | null;
          const stf = a.staff as unknown as { name: string } | null;
          return { id: a.id, service: svc?.name, staff: stf?.name, date: toLocalDateString(s, tz), start_time: toLocalTimeString(s, tz) };
        }),
      };
    },

    async cancel_appointment(args) {
      const parsed = z.object({ appointment_id: uuid }).safeParse(args);
      if (!parsed.success) return invalid(parsed.error);
      // Scoped by business AND by this customer: cannot cancel anybody else's booking.
      const res = await cancelAppointment(sb, business.id, {
        appointmentId: parsed.data.appointment_id,
        customerId: customer.id,
        reason: "Cancelled by customer via WhatsApp",
      });
      if (!res.ok) return { ok: false, error: res.error, message: res.message };
      return { ok: true, message: "Appointment cancelled in the database." };
    },

    async request_human_support(args) {
      const parsed = z.object({ reason: z.string().trim().min(1).max(300) }).safeParse(args);
      if (!parsed.success) return invalid(parsed.error);
      const { error } = await sb
        .from("conversations")
        .update({ status: "human", needs_human: true })
        .eq("id", ctx.conversationId)
        .eq("business_id", business.id);
      if (error) return { ok: false, error: "internal_error" };
      return { ok: true, message: "A team member has been notified and will reply soon." };
    },
  };

  return {
    declarations: TOOL_DECLARATIONS,
    async execute(name, args) {
      const handler = handlers[name];
      if (!handler) return { ok: false, error: "unknown_function" };
      try {
        return await handler(args);
      } catch (err) {
        logError(`ai-tool:${name}`, err);
        return { ok: false, error: "internal_error", message: "The system had a problem. Do not confirm anything; apologise and suggest trying again." };
      }
    },
  };
}
