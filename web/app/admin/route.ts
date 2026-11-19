// Admin panel: a standalone, script-free document (outside the phone-frame app
// shell, like Catatu's admin.html), served at "/" of the admin.* host through
// the proxy rewrite in proxy.ts. Every request re-checks the host and the admin
// gate on the server; nothing here is cached or prerendered.
import { readAdminAccess } from "@/lib/server/adminAccess";
import { loadAccountRows, loadAdminDirectory } from "@/lib/server/adminDirectory";
import { hostHeaderName, isAdminHost } from "@/lib/admin-host";
import { ADMIN_PAGE_SIZE, filterUsers, parseAdminQuery } from "@/lib/admin-users";
import { renderAdminDocument, renderAdminGate, renderAdminPanel } from "@/lib/admin-view";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://salapi.app";
const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
};
const GATE_STATUS = { signin: 401, denied: 403, unavailable: 503 } as const;

export async function GET(request: Request): Promise<Response> {
  // Defense in depth: the proxy already 404s /admin off the admin host.
  if (!isAdminHost(hostHeaderName(request.headers.get("host"))))
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const access = await readAdminAccess();
  if (access.status !== "admin")
    return new Response(renderAdminDocument("Salapi Admin", renderAdminGate(access, APP_URL)), { status: GATE_STATUS[access.status], headers: HEADERS });
  const query = parseAdminQuery(new URL(request.url).searchParams);
  try {
    const directory = await loadAdminDirectory();
    const matches = filterUsers(directory.users, query);
    const pages = Math.max(1, Math.ceil(matches.length / ADMIN_PAGE_SIZE));
    const page = Math.min(query.page, pages);
    const rows = await loadAccountRows(matches.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE));
    const body = renderAdminPanel({
      users: directory.users, walletCount: directory.walletCount, rows, query, page, pages,
      matches: matches.length, adminIds: access.adminIds, viewerId: access.userId, viewerEmail: access.email, now: new Date(), appUrl: APP_URL,
    });
    return new Response(renderAdminDocument("Ringkasan · Salapi Admin", body), { headers: HEADERS });
  } catch (error) {
    console.error("[admin] directory load failed", error instanceof Error ? error.message : "unknown error");
    return new Response(renderAdminDocument("Salapi Admin", renderAdminGate({ status: "unavailable" }, APP_URL)), { status: 503, headers: HEADERS });
  }
}
