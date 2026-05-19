// Next 16: Middleware is now "Proxy" (proxy.ts at project root). Refreshes the
// Supabase auth session on each request. No-op when Supabase env is absent, so
// the app keeps working on the shared demo signer until auth is configured.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON, supabaseConfigured } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Touch the session so Supabase rotates tokens via the cookies above.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline|icon.svg|icon-maskable.svg).*)",
  ],
};
