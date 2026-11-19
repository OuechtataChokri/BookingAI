"use client";

import { Check, UserX, X } from "lucide-react";
import { ConfirmActionButton } from "@/components/forms";
import { setAppointmentStatusAction } from "@/lib/actions/crud";
import type { AppointmentStatus } from "@/lib/types";

export function AppointmentActions({ id, status }: { id: string; status: AppointmentStatus }) {
  if (status === "cancelled" || status === "completed" || status === "no_show") return <span className="text-xs text-slate-400">–</span>;
  return (
    <div className="flex justify-end gap-1.5">
      <ConfirmActionButton action={setAppointmentStatusAction.bind(null, id, "completed")}>
        <Check className="size-3.5" /> Done
      </ConfirmActionButton>
      <ConfirmActionButton action={setAppointmentStatusAction.bind(null, id, "no_show")} confirmText="Mark this customer as a no-show?">
        <UserX className="size-3.5" /> No-show
      </ConfirmActionButton>
      <ConfirmActionButton action={setAppointmentStatusAction.bind(null, id, "cancelled")} confirmText="Cancel this appointment?" variant="danger">
        <X className="size-3.5" /> Cancel
      </ConfirmActionButton>
    </div>
  );
}
