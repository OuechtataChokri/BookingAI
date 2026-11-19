import type { Metadata } from "next";
import { Pencil, Plus, Trash2, UserSquare2 } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getServices, getStaff } from "@/lib/data/queries";
import { deleteStaffAction } from "@/lib/actions/crud";
import { ConfirmActionButton, Modal } from "@/components/forms";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { DAY_SHORT } from "@/lib/utils";
import { StaffForm } from "./staff-form";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const ctx = await getAppContext();
  const [staff, services] = await Promise.all([getStaff(ctx), getServices(ctx)]);
  const addButton = (
    <Modal trigger={<><Plus className="size-4" /> Add staff member</>} title="New staff member">
      <StaffForm services={services} />
    </Modal>
  );

  return (
    <>
      <PageHeader title="Staff" description="Your team, their working days and the services they perform." action={addButton} />
      {staff.length === 0 ? (
        <Card>
          <EmptyState icon={UserSquare2} title="No staff yet" description="Add the people who take appointments. Bookings are assigned to a staff member." action={addButton} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {staff.map((s) => {
            const names = (s.service_ids ?? []).map((id) => services.find((x) => x.id === id)?.name).filter(Boolean);
            return (
              <Card key={s.id} className="flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={s.name} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{s.name}</p>
                    <p className="truncate text-xs text-slate-500">{s.title ?? "Team member"}</p>
                  </div>
                  {s.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                </div>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Days</dt>
                    <dd className="text-right text-slate-800">{s.working_days.map((d) => DAY_SHORT[d]).join(", ")}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Shift</dt>
                    <dd className="text-slate-800">{s.work_start && s.work_end ? `${s.work_start.slice(0, 5)}–${s.work_end.slice(0, 5)}` : "Business hours"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Services</dt>
                    <dd className="text-right text-slate-800">{names.length ? names.join(", ") : "All services"}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
                  <Modal trigger={<><Pencil className="size-3.5" /> Edit</>} title="Edit staff member" triggerVariant="secondary" triggerSize="sm">
                    <StaffForm staff={s} services={services} />
                  </Modal>
                  <ConfirmActionButton action={deleteStaffAction.bind(null, s.id)} confirmText={`Delete ${s.name}?`} variant="danger">
                    <Trash2 className="size-3.5" /> Delete
                  </ConfirmActionButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
