import "server-only";
import { META_GRAPH_VERSION } from "@/lib/env";
import { logError } from "@/lib/logger";

const GRAPH = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type MessengerSendResult = { ok: true; externalMessageId: string | null; mock: boolean } | { ok: false; error: string };
export type MessengerSender = (psid: string, body: string) => Promise<MessengerSendResult>;

/** Sends a text message through the official Meta Messenger Platform Send API. */
export function createMessengerSender(pageAccessToken: string): MessengerSender {
  return async (psid, body) => {
    try {
      const res = await fetch(`${GRAPH}/me/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: { id: psid },
          messaging_type: "RESPONSE",
          message: { text: body.slice(0, 2000) },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        message_id?: string;
        error?: { message?: string; code?: number };
      };
      if (!res.ok) {
        const msg = `Messenger API ${res.status}${json.error?.code ? ` (code ${json.error.code})` : ""}: ${json.error?.message ?? "request failed"}`;
        logError("messenger:send", msg);
        return { ok: false, error: msg.slice(0, 300) };
      }
      return { ok: true, externalMessageId: json.message_id ?? null, mock: false };
    } catch (err) {
      logError("messenger:send", err);
      return { ok: false, error: "Could not reach the Facebook Messenger API." };
    }
  };
}

/** Mock sender: nothing leaves the server. Messages are stored with status "mock". */
export const mockMessengerSender: MessengerSender = async () => ({ ok: true, externalMessageId: null, mock: true });

/** Verifies that a Page Access Token is valid and belongs to the given Page ID. */
export async function verifyPageCredentials(
  pageId: string,
  pageAccessToken: string,
): Promise<{ ok: true; pageName: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH}/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; name?: string; error?: { message?: string } };
    if (!res.ok) {
      return { ok: false, error: json.error?.message ?? `Meta rejected the token (HTTP ${res.status}).` };
    }
    if (json.id !== pageId) {
      return {
        ok: false,
        error: `This token belongs to ID ${json.id ?? "unknown"}, not Page ID ${pageId}. Make sure you generated a Page Access Token for this exact Page.`,
      };
    }
    return { ok: true, pageName: json.name ?? null };
  } catch (err) {
    logError("messenger:verify", err);
    return { ok: false, error: "Could not reach the Facebook Graph API." };
  }
}

/** Best-effort lookup of a Messenger user's display name from their PSID. */
export async function fetchMessengerProfileName(psid: string, pageAccessToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(psid)}?fields=first_name,last_name`, {
      headers: { Authorization: `Bearer ${pageAccessToken}` },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { first_name?: string; last_name?: string };
    const full = [json.first_name, json.last_name].filter(Boolean).join(" ").trim();
    return full || null;
  } catch {
    return null;
  }
}
