import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { logError } from "@/lib/logger";
import {
  createMessengerSender,
  fetchMessengerProfileName,
  mockMessengerSender,
  type MessengerSender,
} from "@/lib/messenger/client";
import type { Business } from "@/lib/types";

export interface ResolvedMessengerConnection {
  business: Business;
  connectionId: string;
  mode: "live" | "mock";
  channel: "messenger";
  pageId: string | null;
  sender: MessengerSender;
  fetchProfileName: (psid: string) => Promise<string | null>;
}

function resolvePageToken(pageId: string, accessTokenEncrypted: string | null): string | null {
  if (accessTokenEncrypted) {
    try {
      return decryptSecret(accessTokenEncrypted);
    } catch (err) {
      logError("messenger:decrypt", err);
    }
  }
  if (env.messengerPageAccessToken && env.messengerPageId === pageId) {
    return env.messengerPageAccessToken;
  }
  return null;
}

/**
 * Resolves the tenant for an incoming Messenger webhook event from entry.id
 * (the Facebook Page ID). Requires the service-role client.
 */
export async function resolveMessengerByPageId(admin: SupabaseClient, pageId: string): Promise<ResolvedMessengerConnection | null> {
  const { data: conn, error } = await admin
    .from("messenger_connections")
    .select("id, business_id, mode, status, page_id, access_token_encrypted")
    .eq("page_id", pageId)
    .eq("mode", "live")
    .eq("status", "connected")
    .maybeSingle();
  if (error || !conn) return null;

  const { data: business } = await admin.from("businesses").select("*").eq("id", conn.business_id).maybeSingle();
  if (!business) return null;

  const token = resolvePageToken(pageId, conn.access_token_encrypted as string | null);

  return {
    business: business as Business,
    connectionId: conn.id as string,
    mode: "live",
    channel: "messenger",
    pageId,
    sender: token
      ? createMessengerSender(token)
      : async () => ({ ok: false as const, error: "No Page Access Token configured for this connection." }),
    fetchProfileName: token ? (psid) => fetchMessengerProfileName(psid, token) : async () => null,
  };
}

/**
 * Resolves a business's Messenger connection for outbound staff replies
 * (only after the caller has authenticated and verified membership).
 */
export async function resolveMessengerByBusinessId(admin: SupabaseClient, business: Business): Promise<ResolvedMessengerConnection | null> {
  const { data: conn, error } = await admin
    .from("messenger_connections")
    .select("id, mode, status, page_id, access_token_encrypted")
    .eq("business_id", business.id)
    .maybeSingle();
  if (error || !conn) return null;

  if (conn.mode === "mock" || conn.status === "mock") {
    return buildMockMessengerConnection(business, conn.id as string);
  }
  if (conn.status !== "connected" || !conn.page_id) return null;

  const pageId = conn.page_id as string;
  const token = resolvePageToken(pageId, conn.access_token_encrypted as string | null);

  return {
    business,
    connectionId: conn.id as string,
    mode: "live",
    channel: "messenger",
    pageId,
    sender: token
      ? createMessengerSender(token)
      : async () => ({ ok: false as const, error: "No Page Access Token configured for this connection." }),
    fetchProfileName: token ? (psid) => fetchMessengerProfileName(psid, token) : async () => null,
  };
}

export function buildMockMessengerConnection(business: Business, connectionId: string): ResolvedMessengerConnection {
  return {
    business,
    connectionId,
    mode: "mock",
    channel: "messenger",
    pageId: null,
    sender: mockMessengerSender,
    fetchProfileName: async () => null,
  };
}
