"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ACTIVE_BUSINESS_COOKIE, requireLiveContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, env } from "@/lib/env";
import { dbErrorMessage, formToObject, runAction, validationError } from "@/lib/actions/utils";
import { isValidTimeZone } from "@/lib/time";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/types";

const languageEnum = z.enum(["ar-TN", "ar", "fr", "en"]);
const typeEnum = z.enum(["barbershop", "beauty_salon", "spa", "clinic", "other"]);
const currency = z.string().regex(/^[A-Z]{3}$/, "Invalid currency");
const timezone = z.string().refine(isValidTimeZone, "Invalid timezone");
const optionalPhone = z
  .string()
  .trim()
  .max(32)
  .optional()
  .transform((v) => (v ? v : ""));

/* -------- Onboarding -------- */
export async function createBusinessAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase is not configured (demo mode)." };
  const parsed = z
    .object({
      name: z.string().trim().min(2, "Business name is too short").max(120),
      businessType: typeEnum,
      timezone,
      currency,
      phone: optionalPhone,
      language: languageEnum,
    })
    .safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data, error } = await supabase.rpc("create_business", {
    p_name: parsed.data.name,
    p_business_type: parsed.data.businessType,
    p_timezone: parsed.data.timezone,
    p_currency: parsed.data.currency,
    p_phone: parsed.data.phone,
    p_default_language: parsed.data.language,
  });
  if (error) {
    if (error.message.includes("business_limit_reached")) return { ok: false, message: "You reached the maximum number of businesses." };
    return { ok: false, message: "Could not create your business. Did you run the database migration?" };
  }
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, data as string, { httpOnly: true, sameSite: "lax", secure: env.isProduction, path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard?welcome=1");
}

/* -------- Switch active business (only among memberships) -------- */
export async function switchBusinessAction(businessId: string): Promise<ActionResult> {
  return runAction("switchBusiness", async () => {
    const ctx = await requireLiveContext();
    if (!z.uuid().safeParse(businessId).success || !ctx.memberships.some((m) => m.business_id === businessId)) {
      return { ok: false, message: "You are not a member of this business." };
    }
    (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, { httpOnly: true, sameSite: "lax", secure: env.isProduction, path: "/", maxAge: 60 * 60 * 24 * 365 });
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  });
}

/* -------- Business profile & AI settings -------- */
export async function updateBusinessAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("updateBusiness", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    const parsed = z
      .object({
        name: z.string().trim().min(2, "Business name is too short").max(120),
        businessType: typeEnum,
        phone: optionalPhone,
        email: z.union([z.literal(""), z.email("Invalid email")]).optional(),
        address: z.string().trim().max(300).optional(),
        timezone,
        currency,
        language: languageEnum,
        slotInterval: z.coerce.number().int().min(5).max(120),
        leadMinutes: z.coerce.number().int().min(0).max(10080),
        horizonDays: z.coerce.number().int().min(1).max(365),
        aiEnabled: z.string().optional(),
        aiInstructions: z.string().trim().max(2000).optional(),
      })
      .safeParse(formToObject(formData));
    if (!parsed.success) return validationError(parsed.error);
    const v = parsed.data;

    const { error } = await ctx.supabase
      .from("businesses")
      .update({
        name: v.name,
        business_type: v.businessType,
        phone: v.phone || null,
        email: v.email || null,
        address: v.address || null,
        timezone: v.timezone,
        currency: v.currency,
        default_language: v.language,
        slot_interval_minutes: v.slotInterval,
        booking_lead_minutes: v.leadMinutes,
        booking_horizon_days: v.horizonDays,
        ai_enabled: v.aiEnabled === "on",
        ai_instructions: v.aiInstructions || null,
      })
      .eq("id", ctx.business.id);
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Settings saved." };
  });
}

/* -------- Business hours -------- */
const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export async function updateHoursAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("updateHours", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    const rows = [];
    for (let d = 0; d < 7; d++) {
      const parsed = z
        .object({ closed: z.boolean(), open: timeStr, close: timeStr })
        .refine((v) => v.closed || v.close > v.open, { message: "Closing time must be after opening time", path: ["close"] })
        .safeParse({
          closed: formData.get(`closed_${d}`) === "on",
          open: formData.get(`open_${d}`),
          close: formData.get(`close_${d}`),
        });
      if (!parsed.success) {
        const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        return { ok: false as const, message: `${names[d]}: ${parsed.error.issues[0]?.message ?? "invalid hours"}` };
      }
      rows.push({
        business_id: ctx.business.id,
        day_of_week: d,
        is_closed: parsed.data.closed,
        open_time: parsed.data.open,
        close_time: parsed.data.close,
      });
    }
    const { error } = await ctx.supabase.from("business_hours").upsert(rows, { onConflict: "business_id,day_of_week" });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Opening hours saved." };
  });
}

/* -------- Team invitations -------- */
export async function inviteMemberAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult<{ link: string }>> {
  return runAction<{ link: string }>("inviteMember", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    const parsed = z
      .object({ email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")), role: z.enum(["admin", "staff"]) })
      .safeParse(formToObject(formData));
    if (!parsed.success) return validationError(parsed.error);
    if (!(await rateLimit(`invite:${ctx.user.id}`, 20, 3600))) return { ok: false, message: "Too many invitations. Try again later." };

    const token = randomBytes(32).toString("base64url");
    const { error } = await ctx.supabase.from("invitations").insert({
      business_id: ctx.business.id,
      email: parsed.data.email,
      role: parsed.data.role,
      token_hash: createHash("sha256").update(token).digest("hex"),
      invited_by: ctx.user.id,
    });
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard/settings");
    // The raw token is shown only once; only its hash is stored.
    return { ok: true, message: "Invitation created. Send this link to your teammate:", data: { link: `${env.appUrl}/invite/${token}` } };
  });
}

export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  return runAction("revokeInvitation", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid invitation." };
    const { error } = await ctx.supabase.from("invitations").delete().eq("id", id).eq("business_id", ctx.business.id);
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard/settings");
    return { ok: true };
  });
}

export async function removeMemberAction(membershipId: string): Promise<ActionResult> {
  return runAction("removeMember", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    if (!z.uuid().safeParse(membershipId).success) return { ok: false, message: "Invalid member." };
    const { data, error } = await ctx.supabase.from("memberships").delete().eq("id", membershipId).eq("business_id", ctx.business.id).neq("role", "owner").select("id");
    if (error) return { ok: false, message: dbErrorMessage(error) };
    if (!data?.length) return { ok: false, message: "This member cannot be removed." };
    revalidatePath("/dashboard/settings");
    return { ok: true };
  });
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Supabase is not configured." };
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please log in first." };
  if (!(await rateLimit(`accept-invite:${auth.user.id}`, 10, 3600))) return { ok: false, message: "Too many attempts." };

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    const map: Record<string, string> = {
      invitation_not_found: "This invitation link is not valid.",
      invitation_already_used: "This invitation was already used.",
      invitation_expired: "This invitation has expired. Ask for a new one.",
      invitation_email_mismatch: "This invitation was sent to a different email address. Log in with that email.",
    };
    const key = Object.keys(map).find((k) => error.message.includes(k));
    return { ok: false, message: key ? map[key] : "Could not accept the invitation." };
  }
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, data as string, { httpOnly: true, sameSite: "lax", secure: env.isProduction, path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true, message: "Welcome to the team!" };
}
