"use client";

import { ActionForm, SubmitButton, fieldError } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { signUpAction } from "@/lib/actions/auth";

export function SignupForm() {
  return (
    <ActionForm action={signUpAction} className="mt-6 space-y-4">
      {({ fieldErrors }) => (
        <>
          <Field label="Your name" htmlFor="fullName" error={fieldError(fieldErrors, "fullName")}>
            <Input id="fullName" name="fullName" autoComplete="name" required minLength={2} maxLength={100} />
          </Field>
          <Field label="Email" htmlFor="email" error={fieldError(fieldErrors, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@salon.com" />
          </Field>
          <Field label="Password" htmlFor="password" hint="At least 8 characters, with a letter and a number." error={fieldError(fieldErrors, "password")}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
          </Field>
          <SubmitButton className="w-full">Create account</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
