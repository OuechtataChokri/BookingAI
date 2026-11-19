"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLiveContext } from "@/lib/auth/context";
import { dbErrorMessage, formToObject, runAction, validationError } from "@/lib/actions/utils";
import { bookAppointment, cancelAppointment, bookingErrorMessage } from "@/lib/booking/engine";
import { isValidDateString, zonedTimeToUtc } from "@/lib/time";
import { normalizePhone } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const uuid = z.uuid("Invalid id");
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

/** Prices are typed in major units (e.g. 25.500) and stored in cents. */
const moneyToCents = z
  .string()
  .trim()
  .transform((v) => v.replace(",", "."))
  .pipe(z.string().regex(/^\d{1,7}(\.\d{1,3})?$/, "Enter a valid price"))
  .transform((v) => Math.round(parseFloat(v) * 100));

const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

/* ======================= Services ======================= */
const serviceSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
  duration: z.coerce.number().int("Whole minutes only").min(5, "Minimum 5 minutes").max(480, "Maximum 8 hours"),
  price: moneyToCents,
  active: z.string().optional(),
});

export async function saveServiceAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("saveService", async () => {
    const ctx = await requireLiveContext();
    const raw = formToObject(formData);
    const parsed = serviceSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const row = {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      duration_minutes: parsed.data.duration,
      price_cents: parsed.data.price,
      is_active: parsed.data.active === "on",
    };
    const id = raw.id ? uuid.safeParse(raw.id) : null;
    if (id && !id.success) return { ok: false, message: "Invalid service." };

    const { error } = id
      ? await ctx.supabase.from("services").update(row).eq("id", id.data).eq("business_id", ctx.business.id)
      : await ctx.supabase.from("services").insert({ ...row, business_id: ctx.business.id });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: id ? "Service updated." : "Service created." };
  });
}

export async function deleteServiceAction(id: string): Promise<ActionResult> {
  return runAction("deleteService", async () => {
    const ctx = await requireLiveContext();
    if (!uuid.safeParse(id).success) return { ok: false, message: "Invalid service." };
    const { error } = await ctx.supabase.from("services").delete().eq("id", id).eq("business_id", ctx.business.id);
    if (error) {
      if (error.code === "23503") return { ok: false, message: "This service has appointments. Deactivate it instead of deleting." };
      return { ok: false, message: dbErrorMessage(error) };
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  });
}

/* ======================= Staff ======================= */
const staffSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    title: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
    email: z.preprocess(emptyToUndef, z.email("Invalid email").max(254).optional()),
    phone: z.preprocess(emptyToUndef, z.string().trim().max(32).optional()),
    workingDays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Select at least one working day"),
    workStart: z.preprocess(emptyToUndef, timeStr.optional()),
    workEnd: z.preprocess(emptyToUndef, timeStr.optional()),
    serviceIds: z.array(uuid),
    active: z.string().optional(),
  })
  .refine((v) => (!v.workStart && !v.workEnd) || (v.workStart && v.workEnd && v.workEnd > v.workStart), {
    path: ["workEnd"],
    message: "Set both times, with the end after the start (or leave both empty)",
  });

export async function saveStaffAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("saveStaff", async () => {
    const ctx = await requireLiveContext();
    const raw = formToObject(formData, ["workingDays", "serviceIds"]);
    const parsed = staffSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const v = parsed.data;
    const id = raw.id ? uuid.safeParse(raw.id) : null;
    if (id && !id.success) return { ok: false, message: "Invalid staff member." };

    // Services must belong to THIS business.
    if (v.serviceIds.length) {
      const { data: valid } = await ctx.supabase.from("services").select("id").eq("business_id", ctx.business.id).in("id", v.serviceIds);
      if ((valid?.length ?? 0) !== new Set(v.serviceIds).size) return { ok: false, message: "One of the selected services is invalid." };
    }

    const row = {
      name: v.name,
      title: v.title ?? null,
      email: v.email ?? null,
      phone: v.phone ?? null,
      working_days: [...new Set(v.workingDays)],
      work_start: v.workStart ?? null,
      work_end: v.workEnd ?? null,
      is_active: v.active === "on",
    };

    let staffId: string;
    if (id) {
      const { data, error } = await ctx.supabase.from("staff").update(row).eq("id", id.data).eq("business_id", ctx.business.id).select("id").maybeSingle();
      if (error) return { ok: false, message: dbErrorMessage(error) };
      if (!data) return { ok: false, message: "Staff member not found." };
      staffId = data.id as string;
    } else {
      const { data, error } = await ctx.supabase.from("staff").insert({ ...row, business_id: ctx.business.id }).select("id").single();
      if (error) return { ok: false, message: dbErrorMessage(error) };
      staffId = data.id as string;
    }

    const { error: delErr } = await ctx.supabase.from("staff_services").delete().eq("staff_id", staffId).eq("business_id", ctx.business.id);
    if (delErr) return { ok: false, message: dbErrorMessage(delErr) };
    if (v.serviceIds.length) {
      const { error: insErr } = await ctx.supabase
        .from("staff_services")
        .insert([...new Set(v.serviceIds)].map((service_id) => ({ business_id: ctx.business.id, staff_id: staffId, service_id })));
      if (insErr) return { ok: false, message: dbErrorMessage(insErr) };
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: id ? "Staff member updated." : "Staff member added." };
  });
}

export async function deleteStaffAction(id: string): Promise<ActionResult> {
  return runAction("deleteStaff", async () => {
    const ctx = await requireLiveContext();
    if (!uuid.safeParse(id).success) return { ok: false, message: "Invalid staff member." };
    const { error } = await ctx.supabase.from("staff").delete().eq("id", id).eq("business_id", ctx.business.id);
    if (error) {
      if (error.code === "23503") return { ok: false, message: "This person has appointments. Deactivate them instead of deleting." };
      return { ok: false, message: dbErrorMessage(error) };
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  });
}

/* ======================= Customers ======================= */
const customerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z
    .string()
    .transform(normalizePhone)
    .pipe(z.union([z.literal(""), z.string().regex(/^[0-9]{6,20}$/, "Enter a valid phone number with country code (e.g. 21620123456)")])),
  email: z.preprocess(emptyToUndef, z.email("Invalid email").max(254).optional()),
  notes: z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
  language: z.preprocess(emptyToUndef, z.enum(["ar-TN", "ar", "fr", "en"]).optional()),
});

export async function saveCustomerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("saveCustomer", async () => {
    const ctx = await requireLiveContext();
    const raw = formToObject(formData);
    const parsed = customerSchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);
    const id = raw.id ? uuid.safeParse(raw.id) : null;
    if (id && !id.success) return { ok: false, message: "Invalid customer." };
    if (!parsed.data.phone && !id) {
      return { ok: false, message: "Enter a phone number with country code (e.g. 21620123456)." };
    }
    const row = {
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      email: parsed.data.email ?? null,
      notes: parsed.data.notes ?? null,
      language: parsed.data.language ?? null,
    };

    const { error } = id
      ? await ctx.supabase.from("customers").update(row).eq("id", id.data).eq("business_id", ctx.business.id)
      : await ctx.supabase.from("customers").insert({ ...row, business_id: ctx.business.id });
    if (error) {
      if (error.code === "23505") return { ok: false, message: "A customer with this phone number already exists." };
      return { ok: false, message: dbErrorMessage(error) };
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: id ? "Customer updated." : "Customer added." };
  });
}

export async function deleteCustomerAction(id: string): Promise<ActionResult> {
  return runAction("deleteCustomer", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    if (!uuid.safeParse(id).success) return { ok: false, message: "Invalid customer." };
    const { error } = await ctx.supabase.from("customers").delete().eq("id", id).eq("business_id", ctx.business.id);
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  });
}

/* ======================= Appointments ======================= */
const appointmentSchema = z.object({
  customerId: uuid,
  serviceId: uuid,
  staffId: z.preprocess(emptyToUndef, uuid.optional()),
  date: z.string().refine(isValidDateString, "Choose a date"),
  time: timeStr,
  notes: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
});

export async function createAppointmentAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("createAppointment", async () => {
    const ctx = await requireLiveContext();
    const parsed = appointmentSchema.safeParse(formToObject(formData));
    if (!parsed.success) return validationError(parsed.error);
    const v = parsed.data;

    // The date/time the user typed is in the BUSINESS timezone; store as UTC.
    const startsAt = zonedTimeToUtc(v.date, v.time, ctx.business.timezone).toISOString();
    const result = await bookAppointment(ctx.supabase, ctx.business.id, {
      customerId: v.customerId,
      serviceId: v.serviceId,
      staffId: v.staffId ?? null,
      startsAt,
      source: "dashboard",
      notes: v.notes ?? null,
    });
    if (!result.ok) return { ok: false, message: result.message };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: `Booked with ${result.staffName}.` };
  });
}

const statusSchema = z.enum(["confirmed", "completed", "no_show", "cancelled"]);

export async function setAppointmentStatusAction(id: string, status: string): Promise<ActionResult> {
  return runAction("setAppointmentStatus", async () => {
    const ctx = await requireLiveContext();
    if (!uuid.safeParse(id).success) return { ok: false, message: "Invalid appointment." };
    const parsed = statusSchema.safeParse(status);
    if (!parsed.success) return { ok: false, message: "Invalid status." };

    if (parsed.data === "cancelled") {
      const res = await cancelAppointment(ctx.supabase, ctx.business.id, { appointmentId: id, allowPast: true, reason: "Cancelled from dashboard" });
      if (!res.ok) return { ok: false, message: bookingErrorMessage(res.error) };
    } else {
      const { data, error } = await ctx.supabase
        .from("appointments")
        .update({ status: parsed.data })
        .eq("id", id)
        .eq("business_id", ctx.business.id)
        .neq("status", "cancelled")
        .select("id");
      if (error) return { ok: false, message: dbErrorMessage(error) };
      if (!data?.length) return { ok: false, message: "Appointment not found or already cancelled." };
    }
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  });
}

/** Used by the booking dialog: lists real free slots computed by the backend. */
export async function fetchSlotsAction(serviceId: string, date: string, staffId?: string) {
  const { getAvailableSlots } = await import("@/lib/booking/engine");
  const ctx = await requireLiveContext().catch(() => null);
  if (!ctx) return { ok: false as const, message: "Slots are not available in demo mode." };
  const res = await getAvailableSlots(ctx.supabase, ctx.business.id, { serviceId, date, staffId: staffId || null });
  if (!res.ok) return { ok: false as const, message: res.message };
  return { ok: true as const, slots: res.slots.map((s) => ({ time: s.start_local, staffName: s.staff_name })) };
}
