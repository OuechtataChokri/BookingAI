import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/env";
import { Alert, buttonStyles } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const demo = !isSupabaseConfigured();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-10">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-semibold text-slate-900">
        <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
          <CalendarCheck2 className="size-5" />
        </span>
        BookAI
      </Link>
      <div className="w-full max-w-md space-y-4">
        {demo && (
          <Alert tone="warning" title="Demo mode">
            Supabase is not configured, so accounts are disabled. You can still explore the app with sample data.
            <div className="mt-2">
              <Link href="/dashboard" className={buttonStyles("secondary", "sm")}>
                Open demo dashboard
              </Link>
            </div>
          </Alert>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
      </div>
    </div>
  );
}
