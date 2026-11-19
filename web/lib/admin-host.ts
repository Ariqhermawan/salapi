// The admin panel lives on its own origin (admin.salapi.app) so a script bug
// anywhere in the main app can never read it: browsers block cross-origin
// reads, and Supabase session cookies are host-only, so admins sign in there
// separately. The panel's internal route (/admin) is reachable only through
// the proxy rewrite of the admin host's "/", never directly on any host.

export type AdminHostRoute = "admin" | "pass" | "not-found";

// What the admin host still serves: sign-in and its OAuth callback, the one
// API the shared layout fetches, Vercel's own scripts, and the exact static
// files sign-in uses. Exact names only: a generic "has a file extension" rule
// would let dynamic app routes such as /tx/a.b render on the admin origin.
// (/_next/static, /_next/image and a few icons never reach the proxy.)
const ADMIN_HOST_ALLOWED = /^\/(?:signin|auth\/callback|api\/market-prices|_vercel\/[^?#]+|icon-(?:192|512|1024)\.png|icon(?:-maskable)?\.svg|apple-icon\.png|favicon\.ico|stellar(?:-white)?\.png|sw\.js|manifest\.webmanifest)$/;

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
