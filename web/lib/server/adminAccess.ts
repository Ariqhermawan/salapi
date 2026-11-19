import "server-only";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { isLocalPreview } from "@/lib/local-preview";
import { supabaseConfigured, supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServer } from "@/lib/supabase/server";
import { parseAdminIds } from "@/lib/admin-users";

export type AdminAccess =
  | { status: "admin"; userId: string; adminIds: ReadonlySet<string> }
  | { status: "denied"; userId: string; email: string | null }
  | { status: "signin" }
  | { status: "unavailable" };

/**
 * Server-verified gate for /admin. Admins are Supabase user IDs listed in
 * SALAPI_ADMIN_USER_IDS (never emails, which a password sign-up could claim).
 * An empty or missing list admits nobody. Auth outages are "unavailable",
 * never mistaken for a signed-out visitor or an admin.
 */
export async function readAdminAccess(): Promise<AdminAccess> {
  if (isLocalPreview || !supabaseConfigured() || !supabaseAdminConfigured()) return { status: "unavailable" };
  try {
    const { data, error } = await (await createSupabaseServer()).auth.getUser();
    const user = data.user;
    if (error) return user === null && isAuthSessionMissingError(error) ? { status: "signin" } : { status: "unavailable" };
    if (user === null) return { status: "signin" };
    if (typeof user?.id !== "string" || !user.id) return { status: "unavailable" };
    const adminIds = parseAdminIds(process.env.SALAPI_ADMIN_USER_IDS);
    if (user.is_anonymous === false && adminIds.has(user.id.toLowerCase())) return { status: "admin", userId: user.id, adminIds };
    return { status: "denied", userId: user.id, email: typeof user.email === "string" ? user.email : null };
  } catch (error) {
    return isAuthSessionMissingError(error) ? { status: "signin" } : { status: "unavailable" };
  }
}
