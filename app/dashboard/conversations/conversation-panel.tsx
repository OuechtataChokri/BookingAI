"use client";

import { useRouter } from "next/navigation";
import { Bot, Send, Sparkles, UserCheck, XCircle } from "lucide-react";
import { ActionForm, ConfirmActionButton, Modal, SubmitButton, fieldError } from "@/components/forms";
import { Alert, Button, Field, Input, Textarea } from "@/components/ui";
import { sendStaffReplyAction, setConversationStatusAction, simulateInboundMessageAction } from "@/lib/actions/messenger";
import type { ActionResult } from "@/lib/types";

export function ConversationControls({ conversationId, status }: { conversationId: string; status: "ai" | "human" | "closed" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "human" && (
        <ConfirmActionButton action={setConversationStatusAction.bind(null, conversationId, "human")} variant="secondary">
          <UserCheck className="size-3.5" /> Take over (Human)
        </ConfirmActionButton>
      )}
      {status !== "ai" && (
        <ConfirmActionButton action={setConversationStatusAction.bind(null, conversationId, "ai")} variant="secondary">
          <Bot className="size-3.5" /> Hand back to AI
        </ConfirmActionButton>
      )}
      {status !== "closed" && (
        <ConfirmActionButton action={setConversationStatusAction.bind(null, conversationId, "closed")} variant="ghost">
          <XCircle className="size-3.5" /> Close
        </ConfirmActionButton>
      )}
    </div>
  );
}

export function ReplyForm({ conversationId, disabled }: { conversationId: string; disabled?: boolean }) {
  return (
    <ActionForm action={sendStaffReplyAction} resetOnSuccess hideSuccess className="border-t border-slate-100 p-4">
      {({ fieldErrors }) => (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="conversationId" value={conversationId} />
          <div className="flex-1">
            <Input
              name="body"
              required
              maxLength={4096}
              disabled={disabled}
              placeholder={disabled ? "Demo mode – connect Supabase to send replies" : "Reply as staff (pauses AI for this chat)…"}
              aria-label="Reply message"
            />
            {fieldError(fieldErrors, "body") && <p className="mt-1 text-xs text-red-600">{fieldError(fieldErrors, "body")}</p>}
          </div>
          <SubmitButton className="shrink-0">
            <Send className="size-4" aria-hidden /> Send
          </SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}

export function SimulatorModal({ defaultPhone }: { defaultPhone?: string }) {
  const router = useRouter();
  return (
    <Modal
      trigger={
        <>
          <Sparkles className="size-4" aria-hidden /> Test AI assistant
        </>
      }
      title="Simulate Messenger customer message"
      triggerVariant="secondary"
    >
      {(close) => (
        <SimulatorForm
          defaultPhone={defaultPhone}
          onSuccess={(conversationId) => {
            close();
            router.push(`/dashboard/conversations?c=${conversationId}`);
            router.refresh();
          }}
        />
      )}
    </Modal>
  );
}

function SimulatorForm({ defaultPhone, onSuccess }: { defaultPhone?: string; onSuccess: (conversationId: string) => void }) {
  return (
    <ActionForm
      action={async (prev, fd) => {
        const res = await simulateInboundMessageAction(prev as ActionResult<{ conversationId: string }> | null, fd);
        if (res.ok && res.data?.conversationId) {
          onSuccess(res.data.conversationId);
        }
        return res;
      }}
      className="space-y-4"
    >
      {({ fieldErrors }) => (
        <>
          <Alert tone="info">
            Runs the exact same pipeline as a real Messenger message (Customer lookup → Gemini AI → Booking tools → Mock reply). Try Tunisian Arabic, Arabic, French or English.
          </Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer phone" htmlFor="sim-phone" error={fieldError(fieldErrors, "phone")}>
              <Input id="sim-phone" name="phone" required defaultValue={defaultPhone ?? "21620111222"} placeholder="21620111222" />
            </Field>
            <Field label="Customer name" htmlFor="sim-name" error={fieldError(fieldErrors, "customerName")}>
              <Input id="sim-name" name="customerName" defaultValue="Test Customer" maxLength={120} />
            </Field>
          </div>
          <Field label="Message" htmlFor="sim-msg" error={fieldError(fieldErrors, "message")}>
            <Textarea
              id="sim-msg"
              name="message"
              required
              maxLength={2000}
              placeholder="Aslema, chnowa les services elli 3andkom w wa9tech t7ellou?"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="reset" variant="secondary">
              Clear
            </Button>
            <SubmitButton>Send test message</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
