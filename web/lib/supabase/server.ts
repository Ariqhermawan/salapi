import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON } from "./env";

// Server-side Supabase client bound to the request cookies (Next 16: cookies()
// is async). Setting cookies during a Server Component render throws — Supabase
// swallows that; the root proxy.ts is what actually refreshes the session.
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          /* called from a Server Component — proxy.ts handles refresh */
        }
      },
    },
  });
}
