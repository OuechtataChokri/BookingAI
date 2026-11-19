import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/context";
import { isSupabaseConfigured } from "@/lib/env";
import { OnboardingForm } from "./onboarding-form";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Set up your business" };

export default async function OnboardingPage() {
  if (isSupabaseConfigured()) {
    const user = await getCurrentUser();
    if (!user) redirect("/login?next=/onboarding");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center gap-2 text-lg font-semibold text-slate-900">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <CalendarCheck2 className="size-5" />
          </span>
          BookAI
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold text-slate-900">Tell us about your business</h1>
          <p className="mt-1 text-sm text-slate-500">This takes one minute. You can change everything later in Settings.</p>
          {!isSupabaseConfigured() && (
            <div className="mt-4">
              <Alert tone="warning" title="Demo mode">Supabase is not configured, so the business cannot be saved yet.</Alert>
            </div>
          )}
          <OnboardingForm />
        </div>
      </div>
    </div>
  );
}
