import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { logError } from "@/lib/logger";
import { createCloudApiSender, mockSender, type Sender } from "@/lib/whatsapp/client";
import type { Business } from "@/lib/types";

export interface ResolvedConnection {
  business: Business;
  connectionId: string;
  mode: "live" | "mock";
  phoneNumberId: string | null;
  sender: Sender;
}

function buildLiveSender(phoneNumberId: string, accessTokenEncrypted: string | null): Sender {
  let token: string | null = null;
  if (accessTokenEncrypted) {
    try {
      token = decryptSecret(accessTokenEncrypted);
    } catch (err) {
      logError("whatsapp:decrypt", err);
    }
  } else if (env.whatsappAccessToken && env.whatsappPhoneNumberId === phoneNumberId) {
    token = env.whatsappAccessToken; // platform-level credentials from env
  }

  return token
    ? createCloudApiSender(phoneNumberId, token)
    : async () => ({ ok: false as const, error: "No access token configured for this connection." });
}

/**
 * Resolves the tenant for an incoming webhook event from the WhatsApp
 * phone_number_id. This is the ONLY way the webhook decides which business
 * owns a message. Requires the service-role client.
 */
export async function resolveConnectionByPhoneNumberId(admin: SupabaseClient, phoneNumberId: string): Promise<ResolvedConnection | null> {
  const { data: conn, error } = await admin
    .from("whatsapp_connections")
    .select("id, business_id, mode, status, phone_number_id, access_token_encrypted")
    .eq("phone_number_id", phoneNumberId)
    .eq("mode", "live")
    .eq("status", "connected")
    .maybeSingle();
  if (error || !conn) return null;

  const { data: business } = await admin.from("businesses").select("*").eq("id", conn.business_id).maybeSingle();
  if (!business) return null;

  return {
    business: business as Business,
    connectionId: conn.id as string,
    mode: "live",
    phoneNumberId,
    sender: buildLiveSender(phoneNumberId, conn.access_token_encrypted as string | null),
  };
}

/**
 * Resolves a business's own WhatsApp connection for outbound staff replies
 * (only after the caller has already authenticated and verified membership).
 */
export async function resolveConnectionByBusinessId(admin: SupabaseClient, business: Business): Promise<ResolvedConnection | null> {
  const { data: conn, error } = await admin
    .from("whatsapp_connections")
    .select("id, mode, status, phone_number_id, access_token_encrypted")
    .eq("business_id", business.id)
    .maybeSingle();
  if (error || !conn) return null;

  if (conn.mode === "mock" || conn.status === "mock") {
    return buildMockConnection(business, conn.id as string);
  }
  if (conn.status !== "connected" || !conn.phone_number_id) return null;

  return {
    business,
    connectionId: conn.id as string,
    mode: "live",
    phoneNumberId: conn.phone_number_id as string,
    sender: buildLiveSender(conn.phone_number_id as string, conn.access_token_encrypted as string | null),
  };
}

export function buildMockConnection(business: Business, connectionId: string): ResolvedConnection {
  return { business, connectionId, mode: "mock", phoneNumberId: null, sender: mockSender };
}
