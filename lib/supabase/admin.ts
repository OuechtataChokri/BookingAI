import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isServiceRoleConfigured } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. BYPASSES Row Level Security.
 * Only use it in trusted server code (WhatsApp webhook, AI tools) AFTER the
 * tenant (business) has been resolved from a trusted source – never from
 * user input.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!isServiceRoleConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  if (!adminClient) {
    adminClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}
