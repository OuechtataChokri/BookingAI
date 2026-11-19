"use client";

import { ActionForm, SubmitButton, fieldError, useModalClose } from "@/components/forms";
import { Field, Input, Textarea, Button } from "@/components/ui";
import { saveServiceAction } from "@/lib/actions/crud";
import type { Service } from "@/lib/types";

export function ServiceForm({ service, onDone }: { service?: Service; onDone?: () => void }) {
  const closeModal = useModalClose();
  const handleDone = onDone ?? closeModal;
  return (
    <ActionForm action={saveServiceAction} onSuccess={handleDone} hideSuccess className="space-y-4">
      {({ fieldErrors }) => (
        <>
          {service && <input type="hidden" name="id" value={service.id} />}
          <Field label="Service name" htmlFor="name" error={fieldError(fieldErrors, "name")}>
            <Input id="name" name="name" required maxLength={120} defaultValue={service?.name} placeholder="Men's haircut" />
          </Field>
          <Field label="Description (optional)" htmlFor="description" error={fieldError(fieldErrors, "description")}>
            <Textarea id="description" name="description" maxLength={1000} defaultValue={service?.description ?? ""} className="min-h-20" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Duration (minutes)" htmlFor="duration" error={fieldError(fieldErrors, "duration")}>
              <Input id="duration" name="duration" type="number" required min={5} max={480} step={5} defaultValue={service?.duration_minutes ?? 30} />
            </Field>
            <Field label="Price" htmlFor="price" hint="e.g. 25 or 25.500" error={fieldError(fieldErrors, "price")}>
              <Input id="price" name="price" inputMode="decimal" required defaultValue={service ? (service.price_cents / 100).toString() : ""} placeholder="25" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="active" defaultChecked={service?.is_active ?? true} className="size-4 rounded border-slate-300 text-brand-600" />
            Active (customers can book it)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleDone}>
              Cancel
            </Button>
            <SubmitButton>{service ? "Save changes" : "Create service"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
