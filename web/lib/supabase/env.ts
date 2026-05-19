// Single source of truth for Supabase env presence. Everything Supabase-related
// guards on these so the app falls back to the shared demo signer (and the
// build stays green) until real credentials are set in Vercel / .env.local.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Browser/session auth usable (URL + anon key present). */
export function supabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON);
}

/** Server-side wallet custody usable (URL + service role present). */
export function supabaseAdminConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE);
}
