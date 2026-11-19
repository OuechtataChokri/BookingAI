import "server-only";
import type {
  Appointment,
  BusinessHours,
  Conversation,
  Customer,
  Invitation,
  Member,
  Message,
  MessengerConnection,
  Service,
  Staff,
  Subscription,
  WhatsAppConnection,
} from "@/lib/types";
import type { AppContext } from "@/lib/auth/context";
import {
  demoAppointments,
  demoConversations,
  demoCustomers,
  demoHours,
  demoMessages,
  demoMessenger,
  demoServices,
  demoStaff,
  demoSubscription,
  demoWhatsApp,
} from "@/lib/demo/data";
import { addDaysToDateString, toLocalDateString, zonedTimeToUtc } from "@/lib/time";

/**
 * Read-side data access. In live mode every query runs with the user's
 * session, so Postgres Row Level Security guarantees tenant isolation; we
 * additionally filter by business_id (defence in depth).
 */

const APPT_SELECT =
  "*, customer:customers(id,name,phone,messenger_psid), service:services(id,name,duration_minutes), staff:staff(id,name)";

export async function getServices(ctx: AppContext): Promise<Service[]> {
  if (ctx.mode === "demo") return demoServices;
  const { data, error } = await ctx.supabase.from("services").select("*").eq("business_id", ctx.business.id).order("name");
  if (error) throw new Error(error.message);
  return data as Service[];
}

export async function getStaff(ctx: AppContext): Promise<Staff[]> {
  if (ctx.mode === "demo") return demoStaff;
  const { data, error } = await ctx.supabase
    .from("staff")
    .select("*, staff_services(service_id)")
    .eq("business_id", ctx.business.id)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const { staff_services, ...rest } = row as Staff & { staff_services: Array<{ service_id: string }> };
    return { ...rest, service_ids: staff_services.map((s) => s.service_id) };
  });
}

export async function getBusinessHours(ctx: AppContext): Promise<BusinessHours[]> {
  if (ctx.mode === "demo") return demoHours;
  const { data, error } = await ctx.supabase
    .from("business_hours")
    .select("*")
    .eq("business_id", ctx.business.id)
    .order("day_of_week");
  if (error) throw new Error(error.message);
  const rows = data as BusinessHours[];
  // Make sure all 7 days exist.
  return Array.from({ length: 7 }, (_, d) => {
    const row = rows.find((r) => r.day_of_week === d);
    return row
      ? { ...row, open_time: row.open_time.slice(0, 5), close_time: row.close_time.slice(0, 5) }
      : { day_of_week: d, is_closed: true, open_time: "09:00", close_time: "19:00" };
  });
}

export async function getCustomers(ctx: AppContext, search?: string): Promise<Customer[]> {
  if (ctx.mode === "demo") {
    const q = search?.toLowerCase();
    return q ? demoCustomers.filter((c) => (c.name ?? "").toLowerCase().includes(q) || (c.phone ?? "").includes(q)) : demoCustomers;
  }
  let query = ctx.supabase.from("customers").select("*").eq("business_id", ctx.business.id).order("created_at", { ascending: false }).limit(500);
  if (search) {
    // Strip characters that have meaning in PostgREST filter syntax.
    const safe = search.replace(/[^\p{L}\p{N}\s@.+-]/gu, "").slice(0, 60);
    if (safe) query = query.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as Customer[];
}

export async function getAppointments(
  ctx: AppContext,
  opts: { from?: string; to?: string; limit?: number; statuses?: string[]; ascending?: boolean } = {},
): Promise<Appointment[]> {
  if (ctx.mode === "demo") {
    return demoAppointments
      .filter((a) => (!opts.from || a.starts_at >= opts.from) && (!opts.to || a.starts_at < opts.to) && (!opts.statuses || opts.statuses.includes(a.status)))
      .sort((a, b) => (opts.ascending === false ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)))
      .slice(0, opts.limit ?? 500);
  }
  let q = ctx.supabase
    .from("appointments")
    .select(APPT_SELECT)
    .eq("business_id", ctx.business.id)
    .order("starts_at", { ascending: opts.ascending !== false })
    .limit(opts.limit ?? 500);
  if (opts.from) q = q.gte("starts_at", opts.from);
  if (opts.to) q = q.lt("starts_at", opts.to);
  if (opts.statuses) q = q.in("status", opts.statuses);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as unknown as Appointment[];
}

export async function getConversations(ctx: AppContext, limit = 100): Promise<Conversation[]> {
  if (ctx.mode === "demo") return demoConversations;
  const { data, error } = await ctx.supabase
    .from("conversations")
    .select("*, customer:customers(id,name,phone,messenger_psid)")
    .eq("business_id", ctx.business.id)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as unknown as Conversation[];
}

export async function getMessages(ctx: AppContext, conversationId: string): Promise<Message[]> {
  if (ctx.mode === "demo") return demoMessages[conversationId] ?? [];
  const { data, error } = await ctx.supabase
    .from("messages")
    .select("id, conversation_id, direction, sender, body, status, error, ai_input_tokens, ai_output_tokens, created_at")
    .eq("business_id", ctx.business.id)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);
  return data as Message[];
}

export async function getMessengerConnection(ctx: AppContext): Promise<MessengerConnection | null> {
  if (ctx.mode === "demo") return demoMessenger;
  const { data, error } = await ctx.supabase
    .from("messenger_connections")
    .select("id, business_id, mode, status, page_id, page_name, last_verified_at, last_error")
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as MessengerConnection | null;
}

export async function getWhatsAppConnection(ctx: AppContext): Promise<WhatsAppConnection | null> {
  if (ctx.mode === "demo") return demoWhatsApp;
  const { data, error } = await ctx.supabase
    .from("whatsapp_connections")
    .select("id, business_id, mode, status, phone_number_id, waba_id, display_phone_number, verified_name, last_verified_at, last_error")
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WhatsAppConnection | null;
}

export async function getSubscription(ctx: AppContext): Promise<Subscription | null> {
  if (ctx.mode === "demo") return demoSubscription;
  const { data, error } = await ctx.supabase
    .from("subscriptions")
    .select("plan, status, trial_ends_at, current_period_end")
    .eq("business_id", ctx.business.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Subscription | null;
}

export async function getTeam(ctx: AppContext): Promise<{ members: Member[]; invitations: Invitation[] }> {
  if (ctx.mode === "demo") {
    return {
      members: [{ id: "mm1", user_id: "u1", role: "owner", created_at: "", email: "owner@example.com" }],
      invitations: [],
    };
  }
  const [{ data: members, error: e1 }, { data: invitations, error: e2 }] = await Promise.all([
    ctx.supabase.from("memberships").select("id, user_id, role, created_at").eq("business_id", ctx.business.id).order("created_at"),
    ctx.role === "staff"
      ? Promise.resolve({ data: [] as Invitation[], error: null })
      : ctx.supabase
          .from("invitations")
          .select("id, email, role, expires_at, accepted_at, created_at")
          .eq("business_id", ctx.business.id)
          .is("accepted_at", null)
          .order("created_at", { ascending: false }),
  ]);
  if (e1) throw new Error(e1.message);
  if (e2) throw new Error(e2.message);
  return { members: (members ?? []) as Member[], invitations: (invitations ?? []) as Invitation[] };
}

/* ---------------- Dashboard statistics ---------------- */

export interface DashboardStats {
  totalAppointments: number;
  todayAppointments: number;
  totalCustomers: number;
  revenueMonthCents: number;
  revenueTotalCents: number;
  projectedRevenueCents: number;
  revenueByDay: Array<{ date: string; cents: number }>;
  upcoming: Appointment[];
  recentConversations: Conversation[];
  messenger: MessengerConnection | null;
  whatsapp: WhatsAppConnection | null;
}

export async function getDashboardStats(ctx: AppContext): Promise<DashboardStats> {
  const tz = ctx.business.timezone;
  const now = new Date();
  const today = toLocalDateString(now, tz);
  const todayStart = zonedTimeToUtc(today, "00:00", tz).toISOString();
  const tomorrowStart = zonedTimeToUtc(addDaysToDateString(today, 1), "00:00", tz).toISOString();
  const monthStart = zonedTimeToUtc(`${today.slice(0, 7)}-01`, "00:00", tz).toISOString();
  const windowStart = zonedTimeToUtc(addDaysToDateString(today, -6), "00:00", tz).toISOString();

  let all: Appointment[];
  let totalAppointments: number;
  let totalCustomers: number;
  let revenueTotalCents: number;

  if (ctx.mode === "demo") {
    all = demoAppointments;
    totalAppointments = all.filter((a) => a.status !== "cancelled").length;
    totalCustomers = demoCustomers.length;
    revenueTotalCents = all.filter((a) => a.status === "completed").reduce((s, a) => s + a.price_cents, 0);
  } else {
    const sb = ctx.supabase;
    const [apptCount, custCount, window, revenue] = await Promise.all([
      sb.from("appointments").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).neq("status", "cancelled"),
      sb.from("customers").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id),
      sb
        .from("appointments")
        .select("id, starts_at, ends_at, status, price_cents, business_id, customer_id, service_id, staff_id, source, notes, created_at")
        .eq("business_id", ctx.business.id)
        .gte("starts_at", monthStart < windowStart ? monthStart : windowStart)
        .limit(2000),
      sb.from("appointments").select("price_cents").eq("business_id", ctx.business.id).eq("status", "completed").limit(20000),
    ]);
    if (apptCount.error) throw new Error(apptCount.error.message);
    totalAppointments = apptCount.count ?? 0;
    totalCustomers = custCount.count ?? 0;
    all = (window.data ?? []) as Appointment[];
    revenueTotalCents = (revenue.data ?? []).reduce((s, r) => s + (r.price_cents as number), 0);
  }

  const counted = (a: Appointment) => a.status === "completed" || a.status === "confirmed";
  const todayAppointments = all.filter((a) => a.starts_at >= todayStart && a.starts_at < tomorrowStart && a.status !== "cancelled").length;
  const revenueMonthCents = all.filter((a) => a.status === "completed" && a.starts_at >= monthStart).reduce((s, a) => s + a.price_cents, 0);
  const projectedRevenueCents = all
    .filter((a) => a.status === "confirmed" && a.starts_at >= now.toISOString())
    .reduce((s, a) => s + a.price_cents, 0);

  const revenueByDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysToDateString(today, i - 6);
    const start = zonedTimeToUtc(date, "00:00", tz).toISOString();
    const end = zonedTimeToUtc(addDaysToDateString(date, 1), "00:00", tz).toISOString();
    const cents = all.filter((a) => counted(a) && a.starts_at >= start && a.starts_at < end).reduce((s, a) => s + a.price_cents, 0);
    return { date, cents };
  });

  const [upcoming, recentConversations, messenger, whatsapp] = await Promise.all([
    getAppointments(ctx, { from: now.toISOString(), statuses: ["confirmed", "pending"], limit: 6 }),
    getConversations(ctx, 5),
    getMessengerConnection(ctx),
    getWhatsAppConnection(ctx),
  ]);

  return {
    totalAppointments,
    todayAppointments,
    totalCustomers,
    revenueMonthCents,
    revenueTotalCents,
    projectedRevenueCents,
    revenueByDay,
    upcoming,
    recentConversations,
    messenger,
    whatsapp,
  };
}
