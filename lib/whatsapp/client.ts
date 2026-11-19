import "server-only";
import { WHATSAPP_GRAPH_VERSION } from "@/lib/env";
import { logError } from "@/lib/logger";

const GRAPH = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}`;

export type SendResult = { ok: true; waMessageId: string | null; mock: boolean } | { ok: false; error: string };
export type Sender = (to: string, body: string) => Promise<SendResult>;

/** Sends a text message through the official WhatsApp Business Cloud API. */
export function createCloudApiSender(phoneNumberId: string, accessToken: string): Sender {
  return async (to, body) => {
    try {
      const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: false, body: body.slice(0, 4096) },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number } };
      if (!res.ok) {
        // Meta's error message never contains our token, but keep it short anyway.
        const msg = `WhatsApp API ${res.status}${json.error?.code ? ` (code ${json.error.code})` : ""}: ${json.error?.message ?? "request failed"}`;
        logError("whatsapp:send", msg);
        return { ok: false, error: msg.slice(0, 300) };
      }
      return { ok: true, waMessageId: json.messages?.[0]?.id ?? null, mock: false };
    } catch (err) {
      logError("whatsapp:send", err);
      return { ok: false, error: "Could not reach the WhatsApp API." };
    }
  };
}

/** Mock sender: nothing leaves the server. Messages are stored with status "mock". */
export const mockSender: Sender = async () => ({ ok: true, waMessageId: null, mock: true });

/** Checks that a phone_number_id + token pair is valid and returns its details. */
export async function verifyCloudApiCredentials(
  phoneNumberId: string,
  accessToken: string,
): Promise<{ ok: true; displayPhoneNumber: string | null; verifiedName: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `Meta rejected the credentials (HTTP ${res.status}).` };
    return { ok: true, displayPhoneNumber: json.display_phone_number ?? null, verifiedName: json.verified_name ?? null };
  } catch (err) {
    logError("whatsapp:verify", err);
    return { ok: false, error: "Could not reach the WhatsApp API." };
  }
}
