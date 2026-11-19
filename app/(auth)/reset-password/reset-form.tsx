"use client";

import { ActionForm, SubmitButton, fieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { updatePasswordAction } from "@/lib/actions/auth";

export function ResetForm() {
  return (
    <ActionForm action={updatePasswordAction} className="mt-6 space-y-4">
      {({ fieldErrors }) => (
        <>
          <Field label="New password" htmlFor="password" hint="At least 8 characters, with a letter and a number." error={fieldError(fieldErrors, "password")}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={fieldError(fieldErrors, "confirm")}>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
          <SubmitButton className="w-full">Update password</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
