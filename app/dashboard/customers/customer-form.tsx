"use client";

import { ActionForm, SubmitButton, fieldError, useModalClose } from "@/components/forms";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { saveCustomerAction } from "@/lib/actions/crud";
import { LANGUAGES } from "@/lib/utils";
import type { Customer } from "@/lib/types";

export function CustomerForm({ customer, onDone }: { customer?: Customer; onDone?: () => void }) {
  const closeModal = useModalClose();
  const handleDone = onDone ?? closeModal;
  return (
    <ActionForm action={saveCustomerAction} onSuccess={handleDone} hideSuccess className="space-y-4">
      {({ fieldErrors }) => (
        <>
          {customer && <input type="hidden" name="id" value={customer.id} />}
          <Field label="Name" htmlFor="name" error={fieldError(fieldErrors, "name")}>
            <Input id="name" name="name" required maxLength={120} defaultValue={customer?.name ?? ""} />
          </Field>
          <Field
            label={customer?.messenger_psid ? "Phone number (optional)" : "Phone number"}
            htmlFor="phone"
            hint="With country code, e.g. 216 20 123 456"
            error={fieldError(fieldErrors, "phone")}
          >
            <Input
              id="phone"
              name="phone"
              type="tel"
              required={!customer?.messenger_psid}
              maxLength={32}
              defaultValue={customer?.phone ?? ""}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email (optional)" htmlFor="email" error={fieldError(fieldErrors, "email")}>
              <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
            </Field>
            <Field label="Language" htmlFor="language" error={fieldError(fieldErrors, "language")}>
              <Select id="language" name="language" defaultValue={customer?.language ?? ""}>
                <option value="">Not set</option>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor="notes" error={fieldError(fieldErrors, "notes")}>
            <Textarea id="notes" name="notes" maxLength={2000} defaultValue={customer?.notes ?? ""} className="min-h-20" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleDone}>
              Cancel
            </Button>
            <SubmitButton>{customer ? "Save changes" : "Add customer"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
