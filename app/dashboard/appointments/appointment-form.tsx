"use client";

import { useEffect, useState } from "react";
import { ActionForm, SubmitButton, fieldError, useModalClose } from "@/components/forms";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { createAppointmentAction, fetchSlotsAction } from "@/lib/actions/crud";
import { cn, formatMoney, formatPhone } from "@/lib/utils";
import type { Customer, Service, Staff } from "@/lib/types";

export function AppointmentForm({
  customers,
  services,
  staff,
  today,
  currency,
  onDone,
}: {
  customers: Customer[];
  services: Service[];
  staff: Staff[];
  today: string;
  currency: string;
  onDone?: () => void;
}) {
  const closeModal = useModalClose();
  const handleDone = onDone ?? closeModal;
  const active = services.filter((s) => s.is_active);
  const [serviceId, setServiceId] = useState(active[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [slotState, setSlotState] = useState<{
    key: string;
    slots: Array<{ time: string; staffName: string }> | null;
    error: string | null;
  } | null>(null);

  const eligibleStaff = staff.filter((s) => s.is_active && (!s.service_ids?.length || s.service_ids.includes(serviceId)));
  const queryKey = serviceId && date ? `${serviceId}:${date}:${staffId}` : "";
  const loading = Boolean(queryKey) && slotState?.key !== queryKey;
  const slots = slotState?.key === queryKey ? slotState.slots : null;
  const slotError = slotState?.key === queryKey ? slotState.error : null;

  useEffect(() => {
    if (!queryKey) return;
    let cancelled = false;
    fetchSlotsAction(serviceId, date, staffId || undefined).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setSlotState({ key: queryKey, slots: res.slots, error: null });
      } else {
        setSlotState({ key: queryKey, slots: null, error: res.message });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [queryKey, serviceId, date, staffId]);

  if (customers.length === 0 || active.length === 0) {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="Almost there">
          {customers.length === 0 && "Add at least one customer. "}
          {active.length === 0 && "Add at least one active service. "}
        </Alert>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={handleDone}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ActionForm action={createAppointmentAction} onSuccess={handleDone} hideSuccess className="space-y-4">
      {({ fieldErrors }) => (
        <>
          <Field label="Customer" htmlFor="customerId" error={fieldError(fieldErrors, "customerId")}>
            <Select id="customerId" name="customerId" required defaultValue="">
              <option value="" disabled>
                Choose a customer…
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? "Unnamed"} · {c.phone ? formatPhone(c.phone) : "Messenger"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service" htmlFor="serviceId" error={fieldError(fieldErrors, "serviceId")}>
            <Select
              id="serviceId"
              name="serviceId"
              required
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setTime("");
              }}
            >
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_minutes} min · {formatMoney(s.price_cents, currency)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Staff" htmlFor="staffId">
              <Select
                id="staffId"
                name="staffId"
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  setTime("");
                }}
              >
                <option value="">Any available</option>
                {eligibleStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="date" error={fieldError(fieldErrors, "date")}>
              <Input
                id="date"
                name="date"
                type="date"
                required
                min={today}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setTime("");
                }}
              />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Available times</legend>
            {loading ? (
              <p className="text-sm text-slate-500">Checking availability…</p>
            ) : slotError ? (
              <Alert tone="warning">{slotError}</Alert>
            ) : slots && slots.length === 0 ? (
              <p className="text-sm text-slate-500">No free slots on this day. Try another date or staff member.</p>
            ) : (
              <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                {slots?.map((s) => (
                  <button
                    type="button"
                    key={s.time}
                    onClick={() => setTime(s.time)}
                    aria-pressed={time === s.time}
                    title={`With ${s.staffName}`}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition",
                      time === s.time ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500",
                    )}
                  >
                    {s.time}
                  </button>
                ))}
              </div>
            )}
            <input type="hidden" name="time" value={time} />
            {fieldError(fieldErrors, "time") && <p className="mt-1 text-xs text-red-600">Pick a time slot.</p>}
          </fieldset>

          <Field label="Notes (optional)" htmlFor="notes">
            <Textarea id="notes" name="notes" maxLength={1000} className="min-h-16" />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={handleDone}>
              Cancel
            </Button>
            <SubmitButton>Book appointment</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
