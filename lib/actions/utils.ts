import "server-only";
import { z } from "zod";
import { DemoModeError, ForbiddenError } from "@/lib/auth/context";
import { logError } from "@/lib/logger";
import type { ActionResult } from "@/lib/types";

/** Wraps a server action: uniform error handling, no internal details leaked. */
export async function runAction<T>(name: string, fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DemoModeError || err instanceof ForbiddenError) {
      return { ok: false, message: err.message };
    }
    // Next.js uses thrown errors for redirect()/notFound(); let them through.
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) {
      throw err;
    }
    logError(`action:${name}`, err);
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export function validationError(error: z.ZodError): ActionResult<never> {
  const flat = z.flattenError(error);
  const first = Object.values(flat.fieldErrors).flat()[0] ?? flat.formErrors[0];
  return {
    ok: false,
    message: (first as string | undefined) ?? "Please check the form for errors.",
    fieldErrors: flat.fieldErrors as Record<string, string[] | undefined>,
  };
}

/** Convert FormData into a plain object (checkbox groups -> arrays). */
export function formToObject(formData: FormData, arrayFields: string[] = []): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    obj[key] = arrayFields.includes(key) ? formData.getAll(key) : formData.get(key);
  }
  for (const f of arrayFields) if (!(f in obj)) obj[f] = [];
  return obj;
}

/** Map Postgres error codes to friendly messages. */
export function dbErrorMessage(error: { code?: string; message?: string } | null): string {
  switch (error?.code) {
    case "23505":
      return "This record already exists.";
    case "23503":
      return "This item is linked to other records and cannot be removed.";
    case "23P01":
      return "This time slot is already taken.";
    case "23514":
      return "Some values are not allowed. Please check the form.";
    case "42501":
      return "You do not have permission to do this.";
    default:
      return "Database error. Please try again.";
  }
}
