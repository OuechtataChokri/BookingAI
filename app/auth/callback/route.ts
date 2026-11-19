import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safePath(next: string | null, fallback: string) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : fallback;
}

/** Handles email confirmation and password-reset links from Supabase. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safePath(searchParams.get("next"), "/dashboard");

  if (!isSupabaseConfigured()) return NextResponse.redirect(`${origin}/login`);

  const supabase = await createSupabaseServerClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  return NextResponse.redirect(`${origin}${ok ? next : "/login?error=link_expired"}`);
}
