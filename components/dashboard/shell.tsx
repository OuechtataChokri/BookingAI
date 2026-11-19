"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CalendarCheck2,
  CalendarDays,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  MessagesSquare,
  Scissors,
  Settings,
  Users,
  UserSquare2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/lib/actions/auth";
import { switchBusinessAction } from "@/lib/actions/business";
import { Avatar } from "@/components/ui";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/dashboard/services", label: "Services", icon: Scissors },
  { href: "/dashboard/staff", label: "Staff", icon: UserSquare2 },
  { href: "/dashboard/customers", label: "Customers", icon: Users },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/dashboard/messenger", label: "Messenger Integration", icon: MessageCircle },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

export function DashboardShell({
  businessName,
  businesses,
  activeBusinessId,
  userEmail,
  demo,
  children,
}: {
  businessName: string;
  businesses: Array<{ business_id: string; name: string }>;
  activeBusinessId: string;
  userEmail: string | null;
  demo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, startSwitch] = useTransition();

  const nav = (
    <nav className="flex-1 space-y-0.5 px-3 py-4" aria-label="Main">
      {NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
            )}
          >
            <item.icon className={cn("size-4", active ? "text-brand-600" : "text-slate-400")} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/dashboard" className="flex h-16 shrink-0 items-center gap-2 px-6 text-base font-semibold text-slate-900">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <CalendarCheck2 className="size-4" />
      </span>
      BookAI
    </Link>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {brand}
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl">
            <button className="absolute right-3 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
            {brand}
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>

          {businesses.length > 1 ? (
            <select
              aria-label="Switch business"
              value={activeBusinessId}
              disabled={switching}
              onChange={(e) =>
                startSwitch(async () => {
                  await switchBusinessAction(e.target.value);
                  router.refresh();
                })
              }
              className="max-w-[12rem] truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 sm:max-w-xs"
            >
              {businesses.map((b) => (
                <option key={b.business_id} value={b.business_id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="truncate text-sm font-semibold text-slate-900">{businessName}</p>
          )}

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <Avatar name={userEmail ?? businessName} className="size-8" />
              <span className="max-w-[10rem] truncate text-xs text-slate-500">{demo ? "Demo user" : userEmail}</span>
            </div>
            {demo ? (
              <Link href="/login" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Log in
              </Link>
            ) : (
              <form action={signOutAction}>
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                  <LogOut className="size-3.5" aria-hidden />
                  Log out
                </button>
              </form>
            )}
          </div>
        </header>

        {demo && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900 sm:px-6">
            <strong>Demo mode</strong> – you are looking at sample data because Supabase is not configured. Changes cannot be saved. See README to connect your database.
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
