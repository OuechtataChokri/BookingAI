import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/context";
import { isSupabaseConfigured } from "@/lib/env";
import { Alert, buttonStyles } from "@/components/ui";
import { AcceptInvite } from "./accept-invite";

export const metadata: Metadata = { title: "Join a team" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  const configured = isSupabaseConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">You have been invited to BookAI</h1>
        <div className="mt-5 space-y-4">
          {!configured ? (
            <Alert tone="warning">Supabase is not configured (demo mode).</Alert>
          ) : user ? (
            <>
              <p className="text-sm text-slate-600">
                You are logged in as <strong>{user.email}</strong>. Accept the invitation to join the team.
              </p>
              <AcceptInvite token={token} />
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">Log in or create an account with the email address that received the invitation.</p>
              <div className="flex gap-2">
                <Link href={`/login?next=/invite/${encodeURIComponent(token)}`} className={buttonStyles("primary")}>
                  Log in
                </Link>
                <Link href="/signup" className={buttonStyles("secondary")}>
                  Create account
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
