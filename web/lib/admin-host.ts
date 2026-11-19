// The admin panel lives on its own origin (admin.salapi.app) so a script bug
// anywhere in the main app can never read it: browsers block cross-origin
// reads, and Supabase session cookies are host-only, so admins sign in there
// separately. The panel's internal route (/admin) is reachable only through
// the proxy rewrite of the admin host's "/", never directly on any host.

export type AdminHostRoute = "admin" | "pass" | "not-found";

// What the admin host still serves: sign-in and its OAuth callback, the one
// API the shared layout fetches, framework internals, and static files.
const ADMIN_HOST_ALLOWED = /^\/(?:signin|auth\/.+|api\/market-prices|_next\/.+|_vercel\/.+)$|^\/[^?#]*\.[a-z0-9]+$/i;

/**
 * Hostname from the Host header (port dropped). Next's nextUrl.hostname can be
 * the server's own name rather than the requested host, so routing uses this.
 */
export function hostHeaderName(host: string | null): string {
  return (host ?? "").replace(/:\d+$/, "").toLowerCase();
}

export function isAdminHost(hostname: string): boolean {
  return hostname.toLowerCase().startsWith("admin.");
}

export function adminHostRoute(hostname: string, pathname: string): AdminHostRoute {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "not-found";
  if (!isAdminHost(hostname)) return "pass";
  if (pathname === "/") return "admin";
  return ADMIN_HOST_ALLOWED.test(pathname) ? "pass" : "not-found";
}
