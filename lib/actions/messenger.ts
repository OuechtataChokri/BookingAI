"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLiveContext } from "@/lib/auth/context";
import { encryptSecret } from "@/lib/crypto";
import { env, isServiceRoleConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { dbErrorMessage, formToObject, runAction, validationError } from "@/lib/actions/utils";
import { rateLimit } from "@/lib/rate-limit";
import { normalizePhone } from "@/lib/utils";
import { verifyPageCredentials } from "@/lib/messenger/client";
import { buildMockMessengerConnection, resolveMessengerByBusinessId } from "@/lib/messenger/connections";
import { processMessengerInbound } from "@/lib/messenger/pipeline";
import type { ActionResult } from "@/lib/types";

const uuid = z.uuid("Invalid id");

function requireAdminClient() {
  if (!isServiceRoleConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing on the server.");
  }
  return getSupabaseAdmin();
}

/* -------- Connect Facebook Messenger Page -------- */
const connectSchema = z.object({
  pageId: z.string().trim().regex(/^[0-9]{5,32}$/, "Facebook Page ID must be 5–32 digits"),
  accessToken: z.string().trim().min(20, "Page Access Token looks too short").max(2048),
});

export async function connectMessengerAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("connectMessenger", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    const parsed = connectSchema.safeParse(formToObject(formData));
    if (!parsed.success) return validationError(parsed.error);
    if (!isServiceRoleConfigured()) {
      return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is required on the server to store encrypted tokens." };
    }
    if (!env.tokenEncryptionKey && !env.supabaseServiceRoleKey) {
      return { ok: false, message: "TOKEN_ENCRYPTION_KEY is required to encrypt the Page Access Token." };
    }

    const v = parsed.data;
    const verification = await verifyPageCredentials(v.pageId, v.accessToken);
    const admin = requireAdminClient();

    if (!verification.ok) {
      await admin
        .from("messenger_connections")
        .upsert(
          {
            business_id: ctx.business.id,
            mode: "live",
            status: "error",
            page_id: v.pageId,
            last_error: verification.error.slice(0, 300),
          },
          { onConflict: "business_id" },
        );
      revalidatePath("/dashboard", "layout");
      return { ok: false, message: `Meta rejected these credentials: ${verification.error}` };
    }

    const encrypted = encryptSecret(v.accessToken);
    const { error } = await admin.from("messenger_connections").upsert(
      {
        business_id: ctx.business.id,
        mode: "live",
        status: "connected",
        page_id: v.pageId,
        page_name: verification.pageName,
        access_token_encrypted: encrypted,
        last_verified_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "business_id" },
    );
    if (error) {
      if (error.code === "23505") {
        return { ok: false, message: "This Facebook Page ID is already linked to another business." };
      }
      return { ok: false, message: dbErrorMessage(error) };
    }

    revalidatePath("/dashboard", "layout");
    return {
      ok: true,
      message: `Connected Facebook Page${verification.pageName ? `: ${verification.pageName}` : ""}.`,
    };
  });
}

export async function enableMockMessengerAction(): Promise<ActionResult> {
  return runAction("enableMockMessenger", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    if (!isServiceRoleConfigured()) {
      return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is required to update the connection." };
    }
    const admin = requireAdminClient();
    const { error } = await admin.from("messenger_connections").upsert(
      {
        business_id: ctx.business.id,
        mode: "mock",
        status: "mock",
        page_id: null,
        page_name: "Mock Sandbox",
        access_token_encrypted: null,
        last_error: null,
      },
      { onConflict: "business_id" },
    );
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Mock mode enabled. You can test the AI assistant in Conversations." };
  });
}

export async function disconnectMessengerAction(): Promise<ActionResult> {
  return runAction("disconnectMessenger", async () => {
    const ctx = await requireLiveContext(["owner", "admin"]);
    if (!isServiceRoleConfigured()) {
      return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY is required to update the connection." };
    }
    const admin = requireAdminClient();
    const { error } = await admin.from("messenger_connections").upsert(
      {
        business_id: ctx.business.id,
        mode: "live",
        status: "disconnected",
        page_id: null,
        page_name: null,
        access_token_encrypted: null,
        last_verified_at: null,
        last_error: null,
      },
      { onConflict: "business_id" },
    );
    if (error) return { ok: false, message: dbErrorMessage(error) };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Facebook Messenger disconnected." };
  });
}

/* -------- Conversations: staff reply & handover -------- */
export async function setConversationStatusAction(conversationId: string, status: string): Promise<ActionResult> {
  return runAction("setConversationStatus", async () => {
    const ctx = await requireLiveContext();
    if (!uuid.safeParse(conversationId).success) return { ok: false, message: "Invalid conversation." };
    const parsed = z.enum(["ai", "human", "closed"]).safeParse(status);
    if (!parsed.success) return { ok: false, message: "Invalid status." };

    const { data, error } = await ctx.supabase
      .from("conversations")
      .update({ status: parsed.data, needs_human: parsed.data === "human" })
      .eq("id", conversationId)
      .eq("business_id", ctx.business.id)
      .select("id");
    if (error) return { ok: false, message: dbErrorMessage(error) };
    if (!data?.length) return { ok: false, message: "Conversation not found." };
    revalidatePath("/dashboard/conversations");
    return { ok: true };
  });
}

export async function sendStaffReplyAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return runAction("sendStaffReply", async () => {
    const ctx = await requireLiveContext();
    const parsed = z
      .object({
        conversationId: uuid,
        body: z.string().trim().min(1, "Write a message").max(2000),
      })
      .safeParse(formToObject(formData));
    if (!parsed.success) return validationError(parsed.error);

    const { data: conv, error: convErr } = await ctx.supabase
      .from("conversations")
      .select("id, wa_contact, channel")
      .eq("id", parsed.data.conversationId)
      .eq("business_id", ctx.business.id)
      .maybeSingle();
    if (convErr) return { ok: false, message: dbErrorMessage(convErr) };
    if (!conv) return { ok: false, message: "Conversation not found." };

    let status: "sent" | "mock" | "failed" = "failed";
    let externalMessageId: string | null = null;
    let sendError: string | null = "Facebook Messenger is not connected.";

    if (isServiceRoleConfigured()) {
      const conn = await resolveMessengerByBusinessId(requireAdminClient(), ctx.business);
      if (conn) {
        const res = await conn.sender(conv.wa_contact as string, parsed.data.body);
        if (res.ok) {
          status = res.mock ? "mock" : "sent";
          externalMessageId = res.externalMessageId;
          sendError = null;
        } else {
          status = "failed";
          sendError = res.error;
        }
      }
    }

    const { error: msgErr } = await ctx.supabase.from("messages").insert({
      business_id: ctx.business.id,
      conversation_id: conv.id,
      direction: "outbound",
      sender: "staff",
      body: parsed.data.body,
      wa_message_id: externalMessageId,
      status,
      error: sendError,
    });
    if (msgErr) return { ok: false, message: dbErrorMessage(msgErr) };

    await ctx.supabase
      .from("conversations")
      .update({
        status: "human",
        needs_human: false,
        last_message_at: new Date().toISOString(),
        last_message_preview: parsed.data.body.replace(/\s+/g, " ").slice(0, 120),
      })
      .eq("id", conv.id)
      .eq("business_id", ctx.business.id);

    revalidatePath("/dashboard/conversations");
    return status === "failed"
      ? { ok: false, message: `Saved in dashboard, but not delivered to Messenger: ${sendError}` }
      : { ok: true, message: status === "mock" ? "Reply recorded (mock mode)." : "Reply sent on Messenger." };
  });
}

/* -------- Test / Mock Simulator -------- */
export async function simulateInboundMessageAction(
  _prev: ActionResult<{ conversationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ conversationId: string }>> {
  return runAction<{ conversationId: string }>("simulateInboundMessage", async () => {
    const ctx = await requireLiveContext();
    const parsed = z
      .object({
        phone: z
          .string()
          .transform(normalizePhone)
          .pipe(z.string().regex(/^[0-9]{5,32}$/, "Enter a valid phone number or Messenger ID")),
        customerName: z.string().trim().max(120).optional(),
        message: z.string().trim().min(1, "Enter a customer message").max(2000),
      })
      .safeParse(formToObject(formData));
    if (!parsed.success) return validationError(parsed.error);
    if (!(await rateLimit(`sim:${ctx.user.id}`, 30, 300))) {
      return { ok: false, message: "Too many test messages. Wait a moment and try again." };
    }

    const conn = buildMockMessengerConnection(ctx.business, "simulator");
    const outcome = await processMessengerInbound(ctx.supabase, conn, {
      externalMessageId: null,
      senderId: parsed.data.phone,
      isPsid: false,
      profileName: parsed.data.customerName || "Test Customer",
      text: parsed.data.message,
    });

    revalidatePath("/dashboard", "layout");
    if (outcome.status === "stored") {
      return { ok: true, message: `Message saved (${outcome.reason}).`, data: { conversationId: outcome.conversationId } };
    }
    if (outcome.status === "replied") {
      return { ok: true, message: "AI replied (mock mode).", data: { conversationId: outcome.conversationId } };
    }
    return { ok: true, message: "Duplicate message ignored." };
  });
}
