import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getCustomers } from "@/lib/data/queries";
import { deleteCustomerAction } from "@/lib/actions/crud";
import { ConfirmActionButton, Modal } from "@/components/forms";
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/ui";
import { formatPhone } from "@/lib/utils";
import { CustomerForm } from "./customer-form";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ctx = await getAppContext();
  const customers = await getCustomers(ctx, q?.trim() || undefined);
  const addButton = (
    <Modal trigger={<><Plus className="size-4" /> Add customer</>} title="New customer">
      <CustomerForm />
    </Modal>
  );

  return (
    <>
      <PageHeader title="Customers" description="People who booked or chatted with your business." action={addButton} />
      <Card>
        <form className="flex gap-2 border-b border-slate-100 p-4" role="search">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <Input name="q" defaultValue={q} placeholder="Search by name or phone…" className="pl-9" aria-label="Search customers" />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {q && (
            <Link href="/dashboard/customers" className="inline-flex items-center rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100">
              Clear
            </Link>
          )}
        </form>
        {customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={q ? "No customers match your search" : "No customers yet"}
            description={q ? "Try a different name or phone number." : "Customers are added automatically when they message you on Messenger, or you can add them here."}
            action={q ? undefined : addButton}
          />
        ) : (
          <Table>
            <thead className="border-b border-slate-100 bg-slate-50/60">
              <tr>
                <Th>Customer</Th>
                <Th>Phone</Th>
                <Th>Language</Th>
                <Th>Notes</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/50">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name ?? c.phone ?? c.messenger_psid} />
                      <span className="font-medium text-slate-900">{c.name ?? "Unnamed"}</span>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {c.phone ? formatPhone(c.phone) : c.messenger_psid ? <Badge tone="blue">Messenger</Badge> : "–"}
                  </Td>
                  <Td>{c.language ? <Badge>{c.language}</Badge> : <span className="text-slate-400">–</span>}</Td>
                  <Td className="max-w-xs truncate text-slate-500">{c.notes ?? "–"}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Modal trigger={<><Pencil className="size-3.5" /> Edit</>} title="Edit customer" triggerVariant="secondary" triggerSize="sm">
                        <CustomerForm customer={c} />
                      </Modal>
                      <ConfirmActionButton action={deleteCustomerAction.bind(null, c.id)} confirmText={`Delete ${c.name ?? c.phone ?? "this customer"} and all their appointments and conversations?`} variant="danger">
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
