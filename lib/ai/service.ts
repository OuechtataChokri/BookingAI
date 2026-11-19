import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isGeminiConfigured } from "@/lib/env";
import { GeminiProvider } from "@/lib/ai/gemini";
import { buildSystemInstruction } from "@/lib/ai/prompt";
import { createBookingTools } from "@/lib/ai/tools";
import { AiError, type AiProvider, type AiRunResult, type ChatTurn } from "@/lib/ai/provider";
import { logError } from "@/lib/logger";
import type { Business } from "@/lib/types";

/** Pick the AI provider. Add new providers here – nothing else changes. */
export function getAiProvider(): AiProvider {
  if (!isGeminiConfigured()) throw new AiError("not_configured", "GEMINI_API_KEY is not set");
  return new GeminiProvider();
}

/** Gemini needs a conversation that starts with the user and alternates roles. */
export function normalizeHistory(turns: ChatTurn[]): ChatTurn[] {
  const merged: ChatTurn[] = [];
  for (const t of turns) {
    if (!t.text.trim()) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === t.role) last.text += `\n${t.text}`;
    else merged.push({ ...t });
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  return merged;
}

export interface AssistantInput {
  sb: SupabaseClient;
  business: Business;
  customer: { id: string; name: string | null };
  conversationId: string;
  channel?: "whatsapp" | "messenger";
  history: ChatTurn[];
}

export async function runAssistant(input: AssistantInput): Promise<AiRunResult> {
  const provider = getAiProvider();
  const history = normalizeHistory(input.history);
  if (history.length === 0 || history[history.length - 1].role !== "user") throw new AiError("empty", "No customer message to answer");

  const channel = input.channel ?? "messenger";
  const tools = createBookingTools({
    sb: input.sb,
    business: input.business,
    customer: input.customer,
    conversationId: input.conversationId,
    channel,
  });
  return provider.generate({
    systemInstruction: buildSystemInstruction(input.business, input.customer.name, channel),
    history,
    tools,
  });
}

/** What the customer sees when the AI cannot answer (multilingual, short). */
export function fallbackReply(error: unknown): string {
  const code = error instanceof AiError ? error.code : "unknown";
  if (code !== "not_configured") logError("ai:fallback", error instanceof Error ? error.message : "unknown", { code });
  if (code === "rate_limited") {
    return "Nous recevons beaucoup de messages en ce moment, réessayez dans une minute svp 🙏\nعذراً، نستقبل عدداً كبيراً من الرسائل، أعد المحاولة بعد دقيقة.";
  }
  return "Désolé, un problème technique est survenu. Un membre de l'équipe vous répondra bientôt 🙏\nعذراً، حدث خطأ تقني، سيرد عليك أحد أعضاء الفريق قريباً.";
}
