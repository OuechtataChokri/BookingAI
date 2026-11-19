import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AiError } from "@/lib/ai/provider";
import { fallbackReply, runAssistant } from "@/lib/ai/service";
import { logError, logInfo } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/utils";
import type { ResolvedConnection } from "@/lib/whatsapp/connections";
import type { Business } from "@/lib/types";

export interface InboundMessage {
  /** WhatsApp message id (wamid...). Used for idempotency. Null in mock mode. */
  waMessageId: string | null;
  from: string;
  profileName?: string | null;
  text: string;
  /** When true we store the message but do not generate an AI reply (e.g. stale retry). */
  skipReply?: boolean;
}

export type InboundOutcome =
  | { status: "duplicate" }
  | { status: "stored"; reason: string; conversationId: string }
  | { status: "replied"; conversationId: string; reply: string; delivery: "sent" | "mock" | "failed" };

const PREVIEW = (t: string) => t.replace(/\s+/g, " ").slice(0, 120);

async function getOrCreateCustomer(sb: SupabaseClient, business: Business, phone: string, name: string | null) {
  const find = () => sb.from("customers").select("id, name").eq("business_id", business.id).eq("phone", phone).maybeSingle();
  const existing = await find();
  if (existing.data) return existing.data as { id: string; name: string | null };
  const ins = await sb
    .from("customers")
    .insert({ business_id: business.id, phone, name: name?.slice(0, 120) || null, language: business.default_language })
    .select("id, name")
    .single();
  if (ins.data) return ins.data as { id: string; name: string | null };
  if (ins.error?.code === "23505") {
    const again = await find(); // concurrent webhook created it first
    if (again.data) return again.data as { id: string; name: string | null };
  }
  throw new Error(`customer upsert failed: ${ins.error?.message}`);
}

async function getOrCreateConversation(sb: SupabaseClient, business: Business, customerId: string, phone: string) {
  const find = () => sb.from("conversations").select("id, status").eq("business_id", business.id).eq("wa_contact", phone).maybeSingle();
  const existing = await find();
  if (existing.data) return existing.data as { id: string; status: "ai" | "human" | "closed" };
  const ins = await sb
    .from("conversations")
    .insert({ business_id: business.id, customer_id: customerId, wa_contact: phone })
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
 * Handles one inbound customer message end to end.
 * `sb` is the service-role client for the webhook (tenant already resolved
 * from phone_number_id) or the user's own client for the dashboard simulator.
 */
export async function processInboundMessage(sb: SupabaseClient, conn: ResolvedConnection, msg: InboundMessage): Promise<InboundOutcome> {
  const { business } = conn;
  const phone = normalizePhone(msg.from);
  if (!/^[0-9]{6,20}$/.test(phone)) throw new Error("invalid sender phone");
  const text = msg.text.trim().slice(0, 4000);

  const customer = await getOrCreateCustomer(sb, business, phone, msg.profileName ?? null);
  const conversation = await getOrCreateConversation(sb, business, customer.id, phone);

  // Idempotency: wa_message_id is UNIQUE. A retried webhook hits the constraint and stops here.
  const { error: insertError } = await sb.from("messages").insert({
    business_id: business.id,
    conversation_id: conversation.id,
    direction: "inbound",
    sender: "customer",
    body: text,
    wa_message_id: msg.waMessageId,
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
      ...(conversation.status === "closed" ? { status: "ai", needs_human: false } : {}),
    })
    .eq("id", conversation.id)
    .eq("business_id", business.id);

  const stored = (reason: string): InboundOutcome => ({ status: "stored", reason, conversationId: conversation.id });
  if (msg.skipReply) return stored("reply skipped");
  if (conversation.status === "human") return stored("conversation handled by a human");
  if (!business.ai_enabled) return stored("AI assistant is disabled for this business");
  if (!(await rateLimit(`wa-ai:${business.id}:${phone}`, 20, 300))) return stored("customer rate limit reached");

  // Conversation memory: last 20 messages.
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
    const result = await runAssistant({ sb, business, customer, conversationId: conversation.id, history });
    reply = result.text;
    usage = result.usage;
    logInfo("ai", "reply generated", {
      business: business.id,
      model: result.usage.model,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      toolCalls: result.toolCalls.length,
    });
  } catch (err) {
    if (err instanceof AiError && err.code === "not_configured") {
      // Do not message real customers with setup errors; flag it for the owner.
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

  const sent = await conn.sender(phone, reply);
  const delivery = sent.ok ? (sent.mock ? "mock" : "sent") : "failed";
  const { error: outError } = await sb.from("messages").insert({
    business_id: business.id,
    conversation_id: conversation.id,
    direction: "outbound",
    sender: "ai",
    body: reply.slice(0, 4096),
    wa_message_id: sent.ok ? sent.waMessageId : null,
    status: delivery,
    error: sent.ok ? null : sent.error,
    ai_model: usage?.model ?? null,
    ai_input_tokens: usage?.inputTokens ?? null,
    ai_output_tokens: usage?.outputTokens ?? null,
  });
  if (outError) logError("pipeline:save-outbound", outError.message);

  await sb
    .from("conversations")
    .update({ last_message_at: new Date().toISOString(), last_message_preview: PREVIEW(reply) })
    .eq("id", conversation.id)
    .eq("business_id", business.id);

  return { status: "replied", conversationId: conversation.id, reply, delivery };
}

const RANK: Record<string, number> = { received: 0, queued: 1, sent: 2, delivered: 3, read: 4 };

/** Applies a WhatsApp delivery status update (sent/delivered/read/failed). Scoped to one business. */
export async function applyStatusUpdate(
  sb: SupabaseClient,
  businessId: string,
  update: { waMessageId: string; status: string; error?: string | null },
) {
  if (!["sent", "delivered", "read", "failed"].includes(update.status)) return;
  const { data: current } = await sb
    .from("messages")
    .select("id, status")
    .eq("business_id", businessId)
    .eq("wa_message_id", update.waMessageId)
    .maybeSingle();
  if (!current) return;
  // Statuses can arrive out of order (e.g. "read" before "delivered"): never go backwards.
  if (update.status !== "failed" && (RANK[current.status as string] ?? 0) >= RANK[update.status]) return;
  await sb
    .from("messages")
    .update({ status: update.status, error: update.status === "failed" ? (update.error ?? "Delivery failed").slice(0, 300) : null })
    .eq("id", current.id)
    .eq("business_id", businessId);
}
