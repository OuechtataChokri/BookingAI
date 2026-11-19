import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CalendarClock, CircleDollarSign, MessageCircle, MessagesSquare, Users } from "lucide-react";
import { getAppContext } from "@/lib/auth/context";
import { getDashboardStats } from "@/lib/data/queries";
import { Alert, Avatar, Badge, Card, CardHeader, EmptyState, PageHeader, StatusBadge, buttonStyles } from "@/components/ui";
import { cn, formatDate, formatMoney, formatPhone, formatTime, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

function Stat({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint?: string; icon: React.ElementType; tone: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className={cn("flex size-9 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const [ctx, sp] = await Promise.all([getAppContext(), searchParams]);
  const stats = await getDashboardStats(ctx);
  const { business } = ctx;
  const tz = business.timezone;
  const money = (c: number) => formatMoney(c, business.currency);
  const maxDay = Math.max(1, ...stats.revenueByDay.map((d) => d.cents));
  const wa = stats.messenger;
  const waLabel = wa?.status === "connected" ? "Connected" : wa?.status === "mock" ? "Mock mode" : wa?.status === "error" ? "Error" : "Not connected";

  return (
    <>
      {sp.welcome && (
        <div className="mb-6">
          <Alert tone="success" title={`Welcome to BookAI, ${business.name}!`}>
            Next steps: add your <Link className="font-medium underline" href="/dashboard/services">services</Link>, your{" "}
            <Link className="font-medium underline" href="/dashboard/staff">team</Link>, then connect{" "}
            <Link className="font-medium underline" href="/dashboard/messenger">Facebook Messenger</Link>.
          </Alert>
        </div>
      )}

      <PageHeader
        title="Overview"
        description={`Here is what is happening at ${business.name}.`}
        action={
          <Link href="/dashboard/appointments" className={buttonStyles("primary")}>
            <CalendarCheck className="size-4" aria-hidden /> New appointment
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total appointments" value={String(stats.totalAppointments)} hint="Excluding cancelled" icon={CalendarCheck} tone="bg-brand-50 text-brand-600" />
        <Stat label="Today" value={String(stats.todayAppointments)} hint="Appointments today" icon={CalendarClock} tone="bg-sky-50 text-sky-600" />
        <Stat label="Customers" value={String(stats.totalCustomers)} icon={Users} tone="bg-emerald-50 text-emerald-600" />
        <Stat
          label="Revenue this month"
          value={money(stats.revenueMonthCents)}
          hint={`${money(stats.projectedRevenueCents)} expected from upcoming`}
          icon={CircleDollarSign}
          tone="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue – last 7 days" description={`Completed and confirmed bookings · all-time completed revenue ${money(stats.revenueTotalCents)}`} />
          <div className="px-5 pb-5 pt-6">
            <div className="flex h-44 items-end gap-2 sm:gap-4" role="img" aria-label="Revenue per day for the last 7 days">
              {stats.revenueByDay.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-36 w-full items-end">
                    <div
                      className="w-full rounded-t-md bg-brand-500/80 transition-all hover:bg-brand-600"
                      style={{ height: `${Math.max(d.cents ? 6 : 2, (d.cents / maxDay) * 100)}%` }}
                      title={`${d.date}: ${money(d.cents)}`}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">{formatDate(`${d.date}T12:00:00Z`, "UTC", { weekday: "short", day: undefined, month: undefined })}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Facebook Messenger" description="Connection status" />
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3">
              <span className={cn("flex size-10 items-center justify-center rounded-full", wa?.status === "connected" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500")}>
                <MessageCircle className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{waLabel}</p>
                <p className="text-xs text-slate-500">{wa?.page_name ? wa.page_name : "No Facebook Page linked"}</p>
              </div>
            </div>
            {wa?.status === "connected" ? (
              <Badge tone="green">Live · customers can book on Messenger</Badge>
            ) : wa?.status === "mock" ? (
              <Badge tone="amber">Mock mode · no real messages are sent</Badge>
            ) : (
              <p className="text-sm text-slate-500">Messenger is not connected. Customers cannot message your AI assistant yet.</p>
            )}
            <Link href="/dashboard/messenger" className={buttonStyles("secondary", "sm")}>
              {wa?.status === "connected" ? "Manage connection" : "Connect Messenger"}
            </Link>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Upcoming appointments"
            action={
              <Link href="/dashboard/appointments" className="text-xs font-medium text-brand-600 hover:underline">
                View all
              </Link>
            }
          />
          {stats.upcoming.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No upcoming appointments" description="New bookings from the dashboard or WhatsApp will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.upcoming.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={a.customer?.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {a.customer?.name ?? (a.customer?.phone ? formatPhone(a.customer.phone) : "Messenger user")}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {a.service?.name} · {a.staff?.name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-900">{formatTime(a.starts_at, tz)}</p>
                    <p className="text-xs text-slate-500">{formatDate(a.starts_at, tz)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent conversations"
            action={
              <Link href="/dashboard/conversations" className="text-xs font-medium text-brand-600 hover:underline">
                View all
              </Link>
            }
          />
          {stats.recentConversations.length === 0 ? (
            <EmptyState icon={MessagesSquare} title="No conversations yet" description="When customers message your Facebook Page, they will show up here." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentConversations.map((c) => (
                <li key={c.id}>
                  <Link href={`/dashboard/conversations?c=${c.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <Avatar name={c.customer?.name ?? c.wa_contact} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{c.customer?.name ?? formatPhone(c.wa_contact)}</p>
                      <p className="bidi truncate text-xs text-slate-500">{c.last_message_preview}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-slate-400">{timeAgo(c.last_message_at)}</span>
                      {c.needs_human && <Badge tone="red">Needs you</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
