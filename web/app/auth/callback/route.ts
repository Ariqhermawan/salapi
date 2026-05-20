import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";

// OAuth redirect target: exchange the ?code for a session, then go to the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code && supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error(
        "[auth/callback] exchangeCodeForSession failed:",
        error.message
      );
      return NextResponse.redirect(`${origin}/signin?error=oauth`);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
