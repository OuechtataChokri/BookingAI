import type { Metadata } from "next";
import { Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getServices } from "@/lib/data/queries";
import { deleteServiceAction } from "@/lib/actions/crud";
import { ConfirmActionButton, Modal } from "@/components/forms";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { ServiceForm } from "./service-form";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage() {
  const ctx = await getAppContext();
  const services = await getServices(ctx);
  const addButton = (
    <Modal trigger={<><Plus className="size-4" /> Add service</>} title="New service">
      <ServiceForm />
    </Modal>
  );

  return (
    <>
      <PageHeader title="Services" description="What customers can book, with duration and price." action={addButton} />
      <Card>
        {services.length === 0 ? (
          <EmptyState icon={Scissors} title="No services yet" description="Add your first service so the AI assistant can tell customers what you offer." action={addButton} />
        ) : (
          <Table>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Service</Th>
                <Th>Duration</Th>
                <Th>Price</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <Td>
                    <p className="font-medium text-slate-900">{s.name}</p>
                    {s.description && <p className="max-w-xs truncate text-xs text-slate-500">{s.description}</p>}
                  </Td>
                  <Td>{s.duration_minutes} min</Td>
                  <Td>{formatMoney(s.price_cents, ctx.business.currency)}</Td>
                  <Td>{s.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Modal trigger={<><Pencil className="size-3.5" /> Edit</>} title="Edit service" triggerVariant="secondary" triggerSize="sm">
                        <ServiceForm service={s} />
                      </Modal>
                      <ConfirmActionButton action={deleteServiceAction.bind(null, s.id)} confirmText={`Delete "${s.name}"?`} variant="danger">
                        <Trash2 className="size-3.5" /> Delete
                      </ConfirmActionButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
