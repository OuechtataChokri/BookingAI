"use client";

import Link from "next/link";
import { ActionForm, SubmitButton, fieldError } from "@/components/forms";
import { Alert, Field, Input } from "@/components/ui";
import { signInAction } from "@/lib/actions/auth";

export function LoginForm({ next, linkExpired }: { next?: string; linkExpired?: boolean }) {
  return (
    <ActionForm action={signInAction} className="mt-6 space-y-4">
      {({ fieldErrors }) => (
        <>
          {linkExpired && <Alert tone="warning">That link has expired. Please log in or request a new one.</Alert>}
          {next && <input type="hidden" name="next" value={next} />}
          <Field label="Email" htmlFor="email" error={fieldError(fieldErrors, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@salon.com" />
          </Field>
          <Field label="Password" htmlFor="password" error={fieldError(fieldErrors, "password")}>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <div className="text-right">
            <Link href="/forgot-password" className="text-xs font-medium text-brand-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          <SubmitButton className="w-full">Log in</SubmitButton>
        </>
      )}
    </ActionForm>
  );
}
