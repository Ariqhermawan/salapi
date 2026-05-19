import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON } from "./env";

// Browser Supabase client (used only for the OAuth sign-in redirect + sign-out).
export function createSupabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON);
}
