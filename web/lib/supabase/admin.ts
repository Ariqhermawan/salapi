import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "./env";

// Service-role client — bypasses RLS, SERVER ONLY. Used solely to read/write the
// per-user wallet custody row. Never import this from a Client Component.
export function createSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
