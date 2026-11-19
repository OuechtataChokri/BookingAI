"use client";

import { ActionForm, SubmitButton, fieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { requestPasswordResetAction } from "@/lib/actions/auth";

export function ForgotForm() {
  return (
    <ActionForm action={requestPasswordResetAction} className="mt-6 space-y-4">
      {({ fieldErrors }) => (
        <>
          <Field label="Email" htmlFor="email" error={fieldError(fieldErrors, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <SubmitButton className="w-full">Send reset link</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
