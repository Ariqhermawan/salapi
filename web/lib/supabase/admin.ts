import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE } from "./env";

// Service-role client, bypasses RLS, SERVER ONLY. Each caller must verify its
// request owner and operation scope before accessing private data or storage.
// Never import this from a Client Component.
export function createSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
