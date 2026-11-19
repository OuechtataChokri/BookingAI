import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getAppointments, getCustomers, getServices, getStaff } from "@/lib/data/queries";
import { Card, EmptyState, PageHeader, StatusBadge, Table, Td, Th, buttonStyles } from "@/components/ui";
import { Modal } from "@/components/forms";
import { addDaysToDateString, isValidDateString, toLocalDateString, weekdayOfDate, zonedTimeToUtc } from "@/lib/time";
import { cn, formatDate, formatMoney, formatPhone, formatTime } from "@/lib/utils";
import { AppointmentForm } from "./appointment-form";
import { AppointmentActions } from "./appointment-actions";
import type { Appointment } from "@/lib/types";

export const metadata: Metadata = { title: "Appointments" };

type SP = { view?: string; week?: string; filter?: string };

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getAppContext();
  const tz = ctx.business.timezone;
  const view = sp.view === "list" ? "list" : "calendar";
  const today = toLocalDateString(new Date(), tz);

  const anchor = sp.week && isValidDateString(sp.week) ? sp.week : today;
  const monday = addDaysToDateString(anchor, -((weekdayOfDate(anchor) + 6) % 7));
  const nextWeek = addDaysToDateString(monday, 7);
  const prevWeek = addDaysToDateString(monday, -7);

  const filter = sp.filter === "past" || sp.filter === "all" ? sp.filter : "upcoming";
  const nowIso = new Date().toISOString();

  const [appointments, customers, services, staff] = await Promise.all([
    view === "calendar"
      ? getAppointments(ctx, { from: zonedTimeToUtc(monday, "00:00", tz).toISOString(), to: zonedTimeToUtc(nextWeek, "00:00", tz).toISOString() })
      : filter === "upcoming"
        ? getAppointments(ctx, { from: nowIso, limit: 200 })
        : filter === "past"
          ? getAppointments(ctx, { to: nowIso, limit: 200, ascending: false })
          : getAppointments(ctx, { limit: 200, ascending: false }),
    getCustomers(ctx),
    getServices(ctx),
    getStaff(ctx),
  ]);

  const newButton = (
    <Modal trigger={<><Plus className="size-4" /> New appointment</>} title="New appointment">
      <AppointmentForm customers={customers} services={services} staff={staff} today={today} currency={ctx.business.currency} />
    </Modal>
  );

  const tabs = (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
      {(["calendar", "list"] as const).map((v) => (
        <Link
          key={v}
          href={`/dashboard/appointments?view=${v}`}
          className={cn("rounded-md px-3 py-1.5 font-medium capitalize", view === v ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:text-slate-900")}
        >
          {v}
        </Link>
      ))}
    </div>
  );

  return (
    <>
      <PageHeader title="Appointments" description={`All times are shown in ${tz}.`} action={<>{tabs}{newButton}</>} />

      {view === "calendar" ? (
        <WeekView monday={monday} today={today} tz={tz} appointments={appointments} currency={ctx.business.currency} prev={prevWeek} next={nextWeek} />
      ) : (
        <Card>
          <div className="flex gap-1 border-b border-slate-100 p-3 text-sm">
            {(["upcoming", "past", "all"] as const).map((f) => (
              <Link
                key={f}
                href={`/dashboard/appointments?view=list&filter=${f}`}
                className={cn("rounded-md px-3 py-1.5 font-medium capitalize", filter === f ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-900")}
              >
                {f}
              </Link>
            ))}
          </div>
          {appointments.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No appointments" description="Book one from here or let customers book on Messenger." action={newButton} />
          ) : (
            <Table>
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <Th>When</Th>
                  <Th>Customer</Th>
                  <Th>Service</Th>
                  <Th>Staff</Th>
                  <Th>Price</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appointments.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <Td className="whitespace-nowrap">
                      <p className="font-medium text-slate-900">{formatDate(a.starts_at, tz)}</p>
                      <p className="text-xs text-slate-500">
                        {formatTime(a.starts_at, tz)}–{formatTime(a.ends_at, tz)}
                      </p>
                    </Td>
                    <Td>
                      <p className="font-medium text-slate-900">{a.customer?.name ?? "Unnamed"}</p>
                      <p className="text-xs text-slate-500">{a.customer?.phone ? formatPhone(a.customer.phone) : ""}</p>
                    </Td>
                    <Td>{a.service?.name}</Td>
                    <Td>{a.staff?.name}</Td>
                    <Td className="whitespace-nowrap">{formatMoney(a.price_cents, ctx.business.currency)}</Td>
                    <Td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={a.status} />
                        {a.source === "messenger" && <span className="text-[11px] text-slate-400">via Messenger</span>}
                        {a.source === "whatsapp" && <span className="text-[11px] text-slate-400">via WhatsApp</span>}
                      </div>
                    </Td>
                    <Td>
                      <AppointmentActions id={a.id} status={a.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

function WeekView({
  monday,
  today,
  tz,
  appointments,
  currency,
  prev,
  next,
}: {
  monday: string;
  today: string;
  tz: string;
  appointments: Appointment[];
  currency: string;
  prev: string;
  next: string;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateString(monday, i));
  const byDay = (d: string) => appointments.filter((a) => toLocalDateString(new Date(a.starts_at), tz) === d && a.status !== "cancelled");
  const base = "/dashboard/appointments?view=calendar";

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">
          {formatDate(`${days[0]}T12:00:00Z`, "UTC", { weekday: undefined })} – {formatDate(`${days[6]}T12:00:00Z`, "UTC", { weekday: undefined })}
        </p>
        <div className="flex items-center gap-1">
          <Link href={`${base}&week=${prev}`} className={buttonStyles("secondary", "sm")} aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href={base} className={buttonStyles("secondary", "sm")}>
            Today
          </Link>
          <Link href={`${base}&week=${next}`} className={buttonStyles("secondary", "sm")} aria-label="Next week">
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
      <div className="grid divide-slate-100 md:grid-cols-7 md:divide-x">
        {days.map((d) => {
          const items = byDay(d);
          return (
            <div key={d} className={cn("min-h-32 border-b border-slate-100 p-3 md:min-h-80 md:border-b-0", d === today && "bg-brand-50/40")}>
              <div className="mb-2 flex items-baseline justify-between md:block">
                <p className={cn("text-xs font-medium uppercase tracking-wide", d === today ? "text-brand-700" : "text-slate-500")}>
                  {formatDate(`${d}T12:00:00Z`, "UTC", { day: undefined, month: undefined })}
                </p>
                <p className={cn("text-lg font-semibold", d === today ? "text-brand-700" : "text-slate-900")}>{Number(d.slice(8))}</p>
              </div>
              <div className="space-y-1.5">
                {items.length === 0 && <p className="text-xs text-slate-300">–</p>}
                {items.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      "rounded-md border-l-2 bg-white p-2 text-xs shadow-sm ring-1 ring-slate-200",
                      a.status === "completed" ? "border-sky-500" : a.status === "no_show" ? "border-red-500" : "border-brand-500",
                    )}
                    title={`${a.service?.name} · ${formatMoney(a.price_cents, currency)}`}
                  >
                    <p className="font-semibold text-slate-900">{formatTime(a.starts_at, tz)}</p>
                    <p className="truncate text-slate-700">{a.customer?.name ?? "Customer"}</p>
                    <p className="truncate text-slate-500">
                      {a.service?.name} · {a.staff?.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
