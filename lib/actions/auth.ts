"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { formToObject, validationError } from "@/lib/actions/utils";
import type { ActionResult } from "@/lib/types";

const NOT_CONFIGURED: ActionResult = {
  ok: false,
  message: "Supabase is not configured yet (demo mode). Add your Supabase keys to .env.local to enable accounts.",
};
const TOO_MANY: ActionResult = { ok: false, message: "Too many attempts. Please wait a few minutes and try again." };

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address"));
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

/** Only allow redirects to paths inside this app (prevents open redirects). */
export async function safeNextPath(next: unknown, fallback = "/dashboard"): Promise<string> {
  if (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) return next;
  return fallback;
}

export async function signUpAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = z
    .object({ fullName: z.string().trim().min(2, "Enter your name").max(100), email: emailSchema, password: passwordSchema })
    .safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);

  const ip = await getClientIp();
  if (!(await rateLimit(`signup:${ip}`, 5, 3600))) return TOO_MANY;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${env.appUrl}/auth/callback?next=/onboarding`,
    },
  });
  if (error) {
    logError("auth:signup", error.message);
    return { ok: false, message: error.message.toLowerCase().includes("registered") ? "An account with this email already exists." : "Could not create the account. Please try again." };
  }
  if (data.session) redirect("/onboarding");
  return { ok: true, message: "Account created! Check your email and click the confirmation link to continue." };
}

export async function signInAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(200), next: z.string().optional() })
    .safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);

  const ip = await getClientIp();
  if (!(await rateLimit(`login:${ip}`, 10, 600)) || !(await rateLimit(`login-email:${parsed.data.email}`, 8, 600))) return TOO_MANY;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    // Same message for wrong email / wrong password (no account enumeration).
    return { ok: false, message: error.code === "email_not_confirmed" ? "Please confirm your email first (check your inbox)." : "Invalid email or password." };
  }
  redirect(await safeNextPath(parsed.data.next));
}

export async function signOutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function requestPasswordResetAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = z.object({ email: emailSchema }).safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);

  const ip = await getClientIp();
  if (!(await rateLimit(`reset:${ip}`, 5, 3600))) return TOO_MANY;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.appUrl}/auth/callback?next=/reset-password`,
  });
  if (error) logError("auth:reset", error.message);
  // Always the same answer so attackers cannot discover which emails exist.
  return { ok: true, message: "If an account exists for this email, we sent a link to reset your password." };
}

export async function updatePasswordAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return NOT_CONFIGURED;
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" })
    .safeParse(formToObject(formData));
  if (!parsed.success) return validationError(parsed.error);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, message: "Your reset link has expired. Request a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: "Could not update the password. Try a different one." };
  redirect("/dashboard");
}
