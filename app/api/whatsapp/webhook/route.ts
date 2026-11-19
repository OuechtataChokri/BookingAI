import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { env, isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual, verifyWhatsAppSignature } from "@/lib/whatsapp/signature";
import { resolveConnectionByPhoneNumberId } from "@/lib/whatsapp/connections";
import { applyStatusUpdate, processInboundMessage } from "@/lib/whatsapp/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET – Meta's one-time webhook verification handshake.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const mode = p.get("hub.mode");
  const token = p.get("hub.verify_token") ?? "";
  const challenge = p.get("hub.challenge") ?? "";

  if (!env.whatsappVerifyToken) return new NextResponse("Webhook not configured", { status: 503 });
  if (mode === "subscribe" && safeEqual(token, env.whatsappVerifyToken)) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

const payloadSchema = z.object({
  object: z.string(),
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string().optional(),
              value: z.object({
                metadata: z.object({ phone_number_id: z.string() }).optional(),
                contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
                messages: z
                  .array(
                    z.object({
                      id: z.string(),
                      from: z.string(),
                      timestamp: z.string().optional(),
                      type: z.string(),
                      text: z.object({ body: z.string() }).optional(),
                    }),
                  )
                  .optional(),
                statuses: z
                  .array(
                    z.object({
                      id: z.string(),
                      status: z.string(),
                      errors: z.array(z.object({ title: z.string().optional(), message: z.string().optional() })).optional(),
                    }),
                  )
                  .optional(),
              }),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

/**
 * POST – incoming messages and delivery statuses.
 * 1. Verify the X-Hub-Signature-256 HMAC over the RAW body (reject if invalid).
 * 2. Respond 200 quickly, process after the response (Meta retries slow webhooks).
 * 3. The business is identified ONLY by metadata.phone_number_id.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text();

  if (!env.whatsappAppSecret) {
    logError("webhook", "WHATSAPP_APP_SECRET is not configured; refusing to process unsigned payloads");
    return new NextResponse("Webhook not configured", { status: 503 });
  }
  if (!verifyWhatsAppSignature(raw, request.headers.get("x-hub-signature-256"), env.whatsappAppSecret)) {
    logError("webhook", "invalid signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }
  if (!isServiceRoleConfigured()) {
    logError("webhook", "SUPABASE_SERVICE_ROLE_KEY missing");
    return new NextResponse("Server not configured", { status: 503 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success || parsed.data.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true, ignored: true }); // not for us; 200 so Meta does not retry
  }

  const payload = parsed.data;
  after(async () => {
    const admin = getSupabaseAdmin();
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        try {
          if (!(await rateLimit(`wa-hook:${phoneNumberId}`, 600, 60))) {
            logError("webhook", "rate limit exceeded", { phoneNumberId });
            continue;
          }
          const conn = await resolveConnectionByPhoneNumberId(admin, phoneNumberId);
          if (!conn) {
            logInfo("webhook", "no active connection for phone_number_id", { phoneNumberId });
            continue;
          }

          for (const st of value.statuses ?? []) {
            await applyStatusUpdate(admin, conn.business.id, {
              waMessageId: st.id,
              status: st.status,
              error: st.errors?.[0]?.message ?? st.errors?.[0]?.title,
            });
          }

          for (const m of value.messages ?? []) {
            const name = value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? null;
            const ageMs = m.timestamp ? Date.now() - Number(m.timestamp) * 1000 : 0;
            const text =
              m.type === "text" && m.text?.body
                ? m.text.body
                : `[${m.type} message – only text is supported]`;
            await processInboundMessage(admin, conn, {
              waMessageId: m.id,
              from: m.from,
              profileName: name,
              text,
              // Do not answer very old retried messages automatically.
              skipReply: ageMs > 30 * 60_000 || m.type !== "text",
            });
          }
        } catch (err) {
          logError("webhook:process", err, { phoneNumberId });
        }
      }
    }
  });

  return NextResponse.json({ ok: true });
}
