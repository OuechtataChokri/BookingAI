import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { demoBusiness } from "@/lib/demo/data";
import type { Business, Role } from "@/lib/types";

export const ACTIVE_BUSINESS_COOKIE = "bookai_business";

export interface LiveContext {
  mode: "live";
  user: Pick<User, "id" | "email">;
  business: Business;
  role: Role;
  supabase: SupabaseClient;
  memberships: Array<{ business_id: string; role: Role; name: string }>;
}

export interface DemoContext {
  mode: "demo";
  business: Business;
  role: Role;
}

export type AppContext = LiveContext | DemoContext;

export class DemoModeError extends Error {
  constructor() {
    super("Demo mode: connect Supabase to save changes.");
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
  }
}

/** Returns the current user (or null). Never trusts client-provided ids. */
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

/**
 * Resolves the tenant for the current request ON THE SERVER:
 * user (validated JWT) -> memberships -> active business.
 * The business id is never taken from the browser, except to SELECT among
 * businesses the user is already a verified member of.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  if (!isSupabaseConfigured()) {
    return { mode: "demo", business: demoBusiness, role: "owner" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: rows, error } = await supabase
    .from("memberships")
    .select("business_id, role, businesses(*)")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Could not load your business. Did you run the database migrations?");
  if (!rows || rows.length === 0) redirect("/onboarding");

  const memberships = rows
    .filter((r) => r.businesses)
    .map((r) => {
      const b = r.businesses as unknown as Business;
      return { business_id: r.business_id as string, role: r.role as Role, name: b.name, business: b };
    });
  if (memberships.length === 0) redirect("/onboarding");

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_BUSINESS_COOKIE)?.value;
  const active = memberships.find((m) => m.business_id === preferred) ?? memberships[0];

  return {
    mode: "live",
    user: { id: auth.user.id, email: auth.user.email },
    business: active.business,
    role: active.role,
    supabase,
    memberships: memberships.map(({ business_id, role, name }) => ({ business_id, role, name })),
  };
});

/** For mutations: demo mode cannot write. Optionally require a role. */
export async function requireLiveContext(roles?: Role[]): Promise<LiveContext> {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") throw new DemoModeError();
  if (roles && !roles.includes(ctx.role)) throw new ForbiddenError();
  return ctx;
}
