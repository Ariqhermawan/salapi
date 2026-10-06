import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/env";
import { authRedirectPath } from "@/lib/authRedirect";
import { safeAppFallback } from "@/lib/ui/app-navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { prepareAuthenticatedWallet } from "@/lib/server/userWallet";

// OAuth redirect target: exchange the ?code for a session, then go to the app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Open-redirect guard: only accept a same-origin relative path. Reject
  // protocol-relative ("//evil.com") and backslash ("/\evil.com") forms that
  // browsers resolve to an external host once concatenated onto `origin`.
  const cookieNext = request.headers.get("cookie")
    ?.match(/(?:^|;\s*)salapi_auth_next=([^;]*)/)?.[1];
  let storedNext: string | null = null;
  if (cookieNext) {
    try {
      storedNext = decodeURIComponent(cookieNext);
    } catch {
      storedNext = null;
    }
  }
  const next = safeAppFallback(authRedirectPath(storedNext ?? searchParams.get("next")));

  function redirect(path: string) {
    const response = NextResponse.redirect(`${origin}${path}`);
    response.cookies.delete("salapi_auth_next");
    return response;
  }

  if (!isLocalPreview && code && supabaseConfigured()) {
    try {
      const supabase = await createSupabaseServer();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return redirect(`/signin?error=oauth&next=${encodeURIComponent(next)}`);
    } catch {
      // Provider/cookie failures must remain retryable without exposing codes.
      return redirect(`/signin?error=oauth&next=${encodeURIComponent(next)}`);
    }
    // The session is valid even if wallet setup is temporarily unavailable.
    // Keep its cookies and original destination; never silently use demo keys.
    try {
      await prepareAuthenticatedWallet();
    } catch {
      return redirect(`/wallet/setup?next=${encodeURIComponent(next)}`);
    }
  }

  return redirect(next);
}
