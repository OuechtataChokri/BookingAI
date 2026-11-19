import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env, isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual, verifyWhatsAppSignature } from "@/lib/whatsapp/signature";
import { resolveMessengerByPageId } from "@/lib/messenger/connections";
import { markMessengerDelivered, processMessengerInbound } from "@/lib/messenger/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET – Meta's one-time webhook verification handshake for Messenger.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token") ?? "";
  const challenge = p.get("hub.challenge") ?? "";

  if (!env.messengerVerifyToken) return new NextResponse("Webhook not configured", { status: 503 });
  if (mode === "subscribe" && safeEqual(token, env.messengerVerifyToken)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

const payloadSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        id: z.string(), // Facebook Page ID
        messaging: z
          .array(
            z.object({
              sender: z.object({ id: z.string() }).optional(),
              recipient: z.object({ id: z.string() }).optional(),
              timestamp: z.number().optional(),
              message: z
                .object({
                  mid: z.string(),
                  text: z.string().optional(),
                  is_echo: z.boolean().optional(),
                  attachments: z.array(z.object({ type: z.string().optional() })).optional(),
                })
                .optional(),
              delivery: z
                .object({
                  mids: z.array(z.string()).optional(),
                })
                .optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

/**
 * POST – incoming Facebook Messenger messages & delivery events.
 * 1. Verify X-Hub-Signature-256 HMAC over the RAW body.
 * 2. Respond 200 quickly, process after the response.
 * 3. Tenant is identified ONLY by entry.id (the Facebook Page ID).
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();

  if (!env.messengerAppSecret) {
    logError("messenger-webhook", "MESSENGER_APP_SECRET is not configured; refusing unsigned payloads");
    return new NextResponse("Webhook not configured", { status: 503 });
  }
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), env.messengerAppSecret)) {
    logError("messenger-webhook", "invalid signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }
  if (!isServiceRoleConfigured()) {
    logError("messenger-webhook", "SUPABASE_SERVICE_ROLE_KEY missing");
    return new NextResponse("Server not configured", { status: 503 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success || parsed.data.object !== "page") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const payload = parsed.data;
  after(async () => {
    const admin = getSupabaseAdmin();
    for (const entry of payload.entry) {
      const pageId = entry.id;
      try {
        if (!(await rateLimit(`msg-hook:${pageId}`, 600, 60))) {
          logError("messenger-webhook", "rate limit exceeded", { pageId });
          continue;
        }
        const conn = await resolveMessengerByPageId(admin, pageId);
        if (!conn) {
          logInfo("messenger-webhook", "no active connection for page_id", { pageId });
          continue;
        }

        for (const ev of entry.messaging) {
          if (ev.delivery?.mids?.length) {
            await markMessengerDelivered(admin, conn.business.id, ev.delivery.mids);
          }

          if (!ev.message || ev.message.is_echo) continue;
          const psid = ev.sender?.id;
          if (!psid || psid === pageId) continue;

          const ageMs = ev.timestamp ? Date.now() - ev.timestamp : 0;
          const hasText = Boolean(ev.message.text?.trim());
          const text = hasText
            ? ev.message.text!
            : `[${ev.message.attachments?.[0]?.type ?? "attachment"} – only text messages are supported]`;

          await processMessengerInbound(admin, conn, {
            externalMessageId: ev.message.mid,
            senderId: psid,
            isPsid: true,
            text,
            skipReply: ageMs > 30 * 60_000 || !hasText,
          });
        }
      } catch (err) {
        logError("messenger-webhook:process", err, { pageId });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
