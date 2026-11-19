import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError } from "@/lib/ai/provider";
import { fallbackReply, runAssistant } from "@/lib/ai/service";
import { logError, logInfo } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/utils";
import type { ResolvedMessengerConnection } from "@/lib/messenger/connections";
import type { Business } from "@/lib/types";

export interface MessengerInboundMessage {
  /** External message id (mid). Used for idempotency. Null in mock mode. */
  externalMessageId: string | null;
  /** Messenger Page-Scoped ID (PSID), or a phone number when testing in Simulator. */
  senderId: string;
  /** True when senderId is a Facebook PSID (live Messenger); false for simulator phone numbers. */
  isPsid: boolean;
  profileName?: string | null;
  text: string;
  skipReply?: boolean;
}

export type MessengerInboundOutcome =
  | { status: "duplicate" }
  | { status: "stored"; reason: string; conversationId: string }
  | { status: "replied"; conversationId: string; reply: string; delivery: "sent" | "mock" | "failed" };

const PREVIEW = (t: string) => t.replace(/\s+/g, " ").slice(0, 120);

async function getOrCreateCustomer(
  sb: SupabaseClient,
  business: Business,
  opts: { senderId: string; isPsid: boolean; name: string | null },
) {
  const column = opts.isPsid ? "messenger_psid" : "phone";
  const find = () => sb.from("customers").select("id, name").eq("business_id", business.id).eq(column, opts.senderId).maybeSingle();
  const existing = await find();
  if (existing.data) {
    const cust = existing.data as { id: string; name: string | null };
    if (!cust.name && opts.name) {
      await sb.from("customers").update({ name: opts.name.slice(0, 120) }).eq("id", cust.id).eq("business_id", business.id);
      cust.name = opts.name.slice(0, 120);
    }
    return cust;
  }

  const row = {
    business_id: business.id,
    messenger_psid: opts.isPsid ? opts.senderId : null,
    phone: opts.isPsid ? null : opts.senderId,
    name: opts.name?.slice(0, 120) || null,
    language: business.default_language,
  };

  const ins = await sb.from("customers").insert(row).select("id, name").single();
  if (ins.data) return ins.data as { id: string; name: string | null };
  if (ins.error?.code === "23505") {
    const again = await find();
    if (again.data) return again.data as { id: string; name: string | null };
  }
  throw new Error(`customer upsert failed: ${ins.error?.message}`);
}

async function getOrCreateConversation(sb: SupabaseClient, business: Business, customerId: string, contactId: string) {
  const find = () =>
    sb.from("conversations").select("id, status").eq("business_id", business.id).eq("wa_contact", contactId).maybeSingle();
  const existing = await find();
  if (existing.data) return existing.data as { id: string; status: "ai" | "human" | "closed" };

  const ins = await sb
    .from("conversations")
    .insert({ business_id: business.id, customer_id: customerId, wa_contact: contactId, channel: "messenger" })
    .select("id, status")
    .single();
  if (ins.data) return ins.data as { id: string; status: "ai" | "human" | "closed" };
  if (ins.error?.code === "23505") {
    const again = await find();
    if (again.data) return again.data as { id: string; status: "ai" | "human" | "closed" };
  }
  throw new Error(`conversation upsert failed: ${ins.error?.message}`);
}

/**
 * Handles one inbound Messenger customer message end to end.
 */
export async function processMessengerInbound(
  sb: SupabaseClient,
  conn: ResolvedMessengerConnection,
  msg: MessengerInboundMessage,
): Promise<MessengerInboundOutcome> {
  const { business } = conn;
  const senderId = msg.isPsid ? msg.senderId.trim() : normalizePhone(msg.senderId);
  if (!/^[0-9]{5,32}$/.test(senderId)) throw new Error("invalid sender id");
  const text = msg.text.trim().slice(0, 4000);

  let profileName = msg.profileName ?? null;
  if (!profileName && msg.isPsid) {
    profileName = await conn.fetchProfileName(senderId);
  }

  const customer = await getOrCreateCustomer(sb, business, { senderId, isPsid: msg.isPsid, name: profileName });
  const conversation = await getOrCreateConversation(sb, business, customer.id, senderId);

  // Idempotency: wa_message_id is UNIQUE. Retried webhooks stop here.
  const { error: insertError } = await sb.from("messages").insert({
    business_id: business.id,
    conversation_id: conversation.id,
    direction: "inbound",
    sender: "customer",
    body: text,
    wa_message_id: msg.externalMessageId,
    status: "received",
  });
  if (insertError) {
    if (insertError.code === "23505") return { status: "duplicate" };
    throw new Error(`message insert failed: ${insertError.message}`);
  }

  const now = new Date().toISOString();
  await sb
    .from("conversations")
    .update({
      last_message_at: now,
      last_inbound_at: now,
      last_message_preview: PREVIEW(text),
      channel: "messenger",
      ...(conversation.status === "closed" ? { status: "ai", needs_human: false } : {}),
    })
    .eq("id", conversation.id)
    .eq("business_id", business.id);

  const stored = (reason: string): MessengerInboundOutcome => ({ status: "stored", reason, conversationId: conversation.id });
  if (msg.skipReply) return stored("reply skipped");
  if (conversation.status === "human") return stored("conversation handled by a human");
  if (!business.ai_enabled) return stored("AI assistant is disabled for this business");
  if (!(await rateLimit(`msg-ai:${business.id}:${senderId}`, 20, 300))) return stored("customer rate limit reached");

  const { data: rows } = await sb
    .from("messages")
    .select("direction, body")
    .eq("business_id", business.id)
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (rows ?? [])
    .reverse()
    .map((r) => ({ role: r.direction === "inbound" ? ("user" as const) : ("assistant" as const), text: r.body as string }));

  let reply: string;
  let usage: { model: string; inputTokens: number; outputTokens: number } | null = null;
  try {
    const result = await runAssistant({ sb, business, customer, conversationId: conversation.id, channel: "messenger", history });
    reply = result.text;
    usage = result.usage;
    logInfo("ai", "reply generated", {
      channel: "messenger",
      business: business.id,
      model: result.usage.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      toolCalls: result.toolCalls.length,
    });
  } catch (err) {
    if (err instanceof AiError && err.code === "not_configured") {
      await sb.from("messages").insert({
        business_id: business.id,
        conversation_id: conversation.id,
        direction: "outbound",
        sender: "system",
        body: "AI assistant is not configured (GEMINI_API_KEY missing). No automatic reply was sent.",
        status: "failed",
      });
      await sb.from("conversations").update({ needs_human: true }).eq("id", conversation.id).eq("business_id", business.id);
      return stored("Gemini is not configured");
    }
    reply = fallbackReply(err);
  }

  const sent = await conn.sender(senderId, reply);
  const delivery = sent.ok ? (sent.mock ? "mock" : "sent") : "failed";
  const { error: outError } = await sb.from("messages").insert({
    business_id: business.id,
    conversation_id: conversation.id,
    direction: "outbound",
    sender: "ai",
    body: reply.slice(0, 4096),
    wa_message_id: sent.ok ? sent.externalMessageId : null,
    status: delivery,
    error: sent.ok ? null : sent.error,
    ai_model: usage?.model ?? null,
    ai_input_tokens: usage?.inputTokens ?? null,
    ai_output_tokens: usage?.outputTokens ?? null,
  });
  if (outError) logError("messenger:save-outbound", outError.message);

  await sb
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_preview: PREVIEW(reply) })
    .eq("id", conversation.id)
    .eq("business_id", business.id);

  return { status: "replied", conversationId: conversation.id, reply, delivery };
}

/** Updates delivery receipts for Messenger message IDs (mids). */
export async function markMessengerDelivered(sb: SupabaseClient, businessId: string, mids: string[]) {
  if (!mids.length) return;
  await sb
    .from("messages")
    .update({ status: "delivered" })
    .eq("business_id", businessId)
    .in("wa_message_id", mids)
    .eq("status", "sent");
}
