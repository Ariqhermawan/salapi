// Admin panel: a standalone, script-free document (outside the phone-frame app
// shell, like Catatu's admin.html), served at "/" of the admin.* host through
// the proxy rewrite in proxy.ts. Every request re-checks the host and the admin
// gate on the server; nothing here is cached or prerendered.
import { readAdminAccess } from "@/lib/server/adminAccess";
import { loadAccountRows, loadAdminDirectory } from "@/lib/server/adminDirectory";
import { readSnapshotState } from "@/lib/server/adminSnapshot";
import { hostHeaderName, isAdminHost } from "@/lib/admin-host";
import { ADMIN_PAGE_SIZE, filterUsers, markTeam, parseAdminIds, parseAdminQuery } from "@/lib/admin-users";
import { renderAdminDocument, renderAdminGate, renderAdminPanel } from "@/lib/admin-view";
import { XLSX_TYPE, adminUsersXlsx, xlsxFilename } from "@/lib/admin-xlsx";

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
  const params = new URL(request.url).searchParams;
  const query = parseAdminQuery(params);
  try {
    // A failed snapshot read only hides the on-chain funnel; the panel still loads.
    const [directory, snapshot] = await Promise.all([
      loadAdminDirectory(),
      readSnapshotState().catch(error => { console.error("[admin] snapshot read failed", error instanceof Error ? error.message : "unknown error"); return undefined; }),
    ]);
    // Admins are always team; SALAPI_TEAM_USER_IDS adds other internal accounts.
    const users = markTeam(directory.users, new Set([...access.adminIds, ...parseAdminIds(process.env.SALAPI_TEAM_USER_IDS)]));
    const txById = snapshot ? new Map([...snapshot.latest].map(([id, row]) => [id, row.txSent])) : undefined;
    const matches = filterUsers(users, query, txById);
    if (params.get("format") === "xlsx") {
      // Always every real account (Excel's own filters slice it further).
      // ponytail: two on-chain reads per row (6 at a time) fit maxDuration for
      // hundreds of accounts; past that, store usernames and tx counts instead.
      const now = new Date();
      const rows = await loadAccountRows(filterUsers(users, { segment: "real", q: "", page: 1, month: "", sort: "daftar" }));
      return new Response(new Uint8Array(adminUsersXlsx(rows, access.adminIds, now)), { headers: {
        ...HEADERS,
        "Content-Type": XLSX_TYPE,
        "Content-Disposition": `attachment; filename="${xlsxFilename(now)}"`,
      } });
    }
    const pages = Math.max(1, Math.ceil(matches.length / ADMIN_PAGE_SIZE));
    const page = Math.min(query.page, pages);
    const rows = await loadAccountRows(matches.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE));
    const body = renderAdminPanel({
      users, walletCount: directory.walletCount, rows, query, page, pages,
      matches: matches.length, adminIds: access.adminIds, viewerId: access.userId, viewerEmail: access.email, snapshot, now: new Date(), appUrl: APP_URL,
    });
    return new Response(renderAdminDocument("Ringkasan · Salapi Admin", body), { headers: HEADERS });
  } catch (error) {
    console.error("[admin] directory load failed", error instanceof Error ? error.message : "unknown error");
    return new Response(renderAdminDocument("Salapi Admin", renderAdminGate({ status: "unavailable" }, APP_URL)), { status: 503, headers: HEADERS });
  }
}
