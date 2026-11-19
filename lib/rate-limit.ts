import "server-only";
import { headers } from "next/headers";
import { isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

/**
 * Rate limiting.
 * - With the service role configured: shared counters in Postgres
 *   (function check_rate_limit) so limits hold across serverless instances.
 * - Otherwise: in-memory fallback (best effort, per instance).
 */
const memory = new Map<string, { count: number; reset: number }>();

export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (isServiceRoleConfigured()) {
    try {
      const { data, error } = await getSupabaseAdmin().rpc("check_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (!error && typeof data === "boolean") return data;
      if (error) logError("rate-limit", error.message);
    } catch (err) {
      logError("rate-limit", err);
    }
  }
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || entry.reset < now) {
    memory.set(key, { count: 1, reset: now + windowSeconds * 1000 });
    if (memory.size > 5000) for (const [k, v] of memory) if (v.reset < now) memory.delete(k);
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
