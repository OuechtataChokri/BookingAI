"use client";

import { ActionForm, SubmitButton, fieldError, useModalClose } from "@/components/forms";
import { Button, Field, Input } from "@/components/ui";
import { saveStaffAction } from "@/lib/actions/crud";
import { DAY_SHORT } from "@/lib/utils";
import type { Service, Staff } from "@/lib/types";

export function StaffForm({ staff, services, onDone }: { staff?: Staff; services: Service[]; onDone?: () => void }) {
  const closeModal = useModalClose();
  const handleDone = onDone ?? closeModal;
  return (
    <ActionForm action={saveStaffAction} onSuccess={handleDone} hideSuccess className="space-y-4">
      {({ fieldErrors }) => (
        <>
          {staff && <input type="hidden" name="id" value={staff.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" error={fieldError(fieldErrors, "name")}>
              <Input id="name" name="name" required maxLength={120} defaultValue={staff?.name} />
            </Field>
            <Field label="Role / title (optional)" htmlFor="title" error={fieldError(fieldErrors, "title")}>
              <Input id="title" name="title" maxLength={80} defaultValue={staff?.title ?? ""} placeholder="Senior barber" />
            </Field>
            <Field label="Email (optional)" htmlFor="email" error={fieldError(fieldErrors, "email")}>
              <Input id="email" name="email" type="email" defaultValue={staff?.email ?? ""} />
            </Field>
            <Field label="Phone (optional)" htmlFor="phone" error={fieldError(fieldErrors, "phone")}>
              <Input id="phone" name="phone" type="tel" maxLength={32} defaultValue={staff?.phone ?? ""} />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Working days</legend>
            <div className="flex flex-wrap gap-2">
              {DAY_SHORT.map((d, i) => (
                <label key={d} className="cursor-pointer">
                  <input type="checkbox" name="workingDays" value={i} defaultChecked={(staff?.working_days ?? [1, 2, 3, 4, 5, 6]).includes(i)} className="peer sr-only" />
                  <span className="inline-block rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500">
                    {d}
                  </span>
                </label>
              ))}
            </div>
            {fieldError(fieldErrors, "workingDays") && <p className="mt-1 text-xs text-red-600">{fieldError(fieldErrors, "workingDays")}</p>}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Shift start (optional)" htmlFor="workStart" hint="Leave empty to follow business hours" error={fieldError(fieldErrors, "workStart")}>
              <Input id="workStart" name="workStart" type="time" defaultValue={staff?.work_start?.slice(0, 5) ?? ""} />
            </Field>
            <Field label="Shift end (optional)" htmlFor="workEnd" error={fieldError(fieldErrors, "workEnd")}>
              <Input id="workEnd" name="workEnd" type="time" defaultValue={staff?.work_end?.slice(0, 5) ?? ""} />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Services performed</legend>
            {services.length === 0 ? (
              <p className="text-sm text-slate-500">Create services first. Until then this person can do every service.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {services.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="serviceIds" value={s.id} defaultChecked={staff?.service_ids?.includes(s.id)} className="size-4 rounded border-slate-300 text-brand-600" />
                    {s.name}
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">If none is selected, this person can perform every service.</p>
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="active" defaultChecked={staff?.is_active ?? true} className="size-4 rounded border-slate-300 text-brand-600" />
            Active (can receive bookings)
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleDone}>
              Cancel
            </Button>
            <SubmitButton>{staff ? "Save changes" : "Add staff member"}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
