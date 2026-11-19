"use client";

import { ActionForm, ConfirmActionButton, SubmitButton, fieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { connectMessengerAction, disconnectMessengerAction, enableMockMessengerAction } from "@/lib/actions/messenger";
import type { MessengerConnection } from "@/lib/types";

export function ConnectMessengerForm({ connection, disabled }: { connection: MessengerConnection | null; disabled?: boolean }) {
  return (
    <ActionForm action={connectMessengerAction} className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <Field
            label="Facebook Page ID"
            htmlFor="pageId"
            hint="Find it in your Facebook Page → About → Page transparency, or Meta Developers → Messenger → API Setup."
            error={fieldError(fieldErrors, "pageId")}
          >
            <Input
              id="pageId"
              name="pageId"
              required
              disabled={disabled}
              defaultValue={connection?.page_id ?? ""}
              placeholder="e.g. 123456789012345"
            />
          </Field>
          <Field
            label="Page Access Token"
            htmlFor="accessToken"
            hint="Generated in Meta Developers → Messenger → Access Tokens. Stored encrypted with AES-256-GCM on the server."
            error={fieldError(fieldErrors, "accessToken")}
          >
            <Input id="accessToken" name="accessToken" type="password" required disabled={disabled} placeholder="EAA..." autoComplete="off" />
          </Field>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <SubmitButton>Verify & connect</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}

export function MessengerModeActions({ status, canManage }: { status: string; canManage: boolean }) {
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "mock" && (
        <ConfirmActionButton action={enableMockMessengerAction} variant="secondary" size="md">
          Enable mock mode (testing)
        </ConfirmActionButton>
      )}
      {status !== "disconnected" && (
        <ConfirmActionButton
          action={disconnectMessengerAction}
          confirmText="Disconnect Facebook Messenger for this business? Incoming messages will stop being answered."
          variant="danger"
          size="md"
        >
          Disconnect
        </ConfirmActionButton>
      )}
    </div>
  );
}
