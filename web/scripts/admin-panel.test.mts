import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { isAuthSessionMissingError, AuthSessionMissingError } from "@supabase/supabase-js";
import { StrKey } from "@stellar/stellar-sdk";
import { accountSegment, filterUsers, monthlySignups, parseAdminIds, parseAdminQuery, sentTransactionCount, wibMonth, type AdminAccountRow, type AdminAuthUser } from "../lib/admin-users.ts";
import { adminHref, renderAdminDocument, renderAdminGate, renderAdminPanel } from "../lib/admin-view.ts";
import { escapeHtml, html } from "../lib/admin-html.ts";
import { adminHostRoute, hostHeaderName } from "../lib/admin-host.ts";
import { adminUsersXlsx, crc32, excelMonth, excelWib, xlsxFilename } from "../lib/admin-xlsx.ts";
import { inflateRawSync } from "node:zlib";

const adminId = "00000000-0000-4000-8000-0000000000aa";
const otherId = "00000000-0000-4000-8000-0000000000bb";
const address = "GCUBT6T7SMQKJE5L2TJLUQQPSBBU5GVHALGLWWECEJUIV2YFFCSXGHY7";
const user = (over: Partial<AdminAuthUser> = {}): AdminAuthUser => ({ id: otherId, email: "person@gmail.com", created_at: "2026-11-02T03:00:00Z", app_metadata: { provider: "google" }, user_metadata: {}, ...over });

test("segments keep simulation, load test and QA accounts out of real users", () => {
  assert.equal(accountSegment(user()), "real");
  assert.equal(accountSegment(user({ app_metadata: { synthetic: true } })), "simulation");
  assert.equal(accountSegment(user({ email: "x@salapi.app", user_metadata: { is_load_test_user: true } })), "load_test");
  assert.equal(accountSegment(user({ email: "qa@salapi.invalid" })), "qa");
  assert.equal(accountSegment(user({ email: "qa@salapi.TEST" })), "qa");
  // Only exact boolean flags count; editable metadata can never promote an account to "real".
  assert.equal(accountSegment(user({ app_metadata: { synthetic: "true" } })), "real");
  assert.equal(accountSegment(user({ email: "a@gmail.com.invalid", user_metadata: { is_load_test_user: false } })), "qa");
});

test("admin IDs accept only UUIDs and fail closed when unset", () => {
  assert.equal(parseAdminIds(undefined).size, 0);
  assert.equal(parseAdminIds("").size, 0);
  assert.deepEqual([...parseAdminIds(` ${adminId.toUpperCase()}, not-a-uuid ,person@gmail.com\n${otherId}`)], [adminId, otherId]);
});

test("monthly signups use WIB calendar months, zero-fill gaps and roll over years", () => {
  assert.equal(wibMonth("2026-10-31T16:59:59Z"), "2026-10");
  assert.equal(wibMonth("2026-10-31T17:00:00Z"), "2026-11");
  const months = monthlySignups([
    user({ created_at: "2025-11-30T18:00:00Z" }),
    user({ created_at: "2026-01-05T00:00:00Z", app_metadata: { synthetic: true } }),
    user({ created_at: "2026-01-06T00:00:00Z" }),
    user({ created_at: "not a date" }),
  ], new Date("2026-02-10T00:00:00Z"));
  assert.deepEqual(months, [
    { month: "2025-12", total: 1, real: 1 },
    { month: "2026-01", total: 2, real: 1 },
    { month: "2026-02", total: 0, real: 0 },
  ]);
  assert.deepEqual(monthlySignups([], new Date()), []);
  assert.deepEqual(monthlySignups([user({ created_at: "2026-02-01T00:00:00Z" })], new Date("2026-02-10T00:00:00Z")), [{ month: "2026-02", total: 1, real: 1 }]);
  // A clock-skewed future signup is still counted, not dropped from the chart.
  assert.deepEqual(monthlySignups([user({ created_at: "2026-04-01T00:00:00Z" })], new Date("2026-02-10T00:00:00Z")).map(m => [m.month, m.total]), [["2026-04", 1]]);
});

test("sent transactions come from the low 32 bits of the account sequence", () => {
  assert.equal(sentTransactionCount(((123456n << 32n) + 7n).toString()), 7);
  assert.equal(sentTransactionCount((987654n << 32n).toString()), 0);
  for (const bad of [null, 12, "", "-1", "1e9", "12a", "1".repeat(21)]) assert.equal(sentTransactionCount(bad), null);
});

test("query parsing clamps unknown segments and pages; filtering searches email and ID newest first", () => {
  // The directory opens on real users; unknown segments fall back to that view.
  assert.deepEqual(parseAdminQuery(new URLSearchParams("")), { segment: "real", q: "", page: 1, month: "" });
  assert.deepEqual(parseAdminQuery(new URLSearchParams("segment=evil&page=-3&q=%20a%20")), { segment: "real", q: "a", page: 1, month: "" });
  assert.deepEqual(parseAdminQuery(new URLSearchParams("segment=all&page=2&month=2026-10")), { segment: "all", q: "", page: 2, month: "2026-10" });
  for (const month of ["2026-13", "2026-1", "26-10", "2026-10-01", "<b>"]) assert.equal(parseAdminQuery(new URLSearchParams({ month })).month, "");
  assert.equal(parseAdminQuery(new URLSearchParams(`q=${"x".repeat(500)}`)).q.length, 100);
  const older = user({ id: adminId, email: "Owner@Example.com", created_at: "2026-09-01T00:00:00Z" });
  const newer = user({ created_at: "2026-11-01T00:00:00Z" });
  const sim = user({ email: "sim@salapi.invalid", app_metadata: { synthetic: true } });
  const base = { q: "", page: 1, month: "" };
  assert.deepEqual(filterUsers([older, newer, sim], { ...base, segment: "real" }), [newer, older]);
  assert.deepEqual(filterUsers([older, newer, sim], { ...base, segment: "all", q: "owner@" }), [older]);
  assert.deepEqual(filterUsers([older, newer, sim], { ...base, segment: "all", q: "0000aa" }), [older]);
  // Month uses the WIB calendar: 2026-10-31 17:30 UTC is already November in Jakarta.
  const edge = user({ created_at: "2026-10-31T17:30:00Z" });
  assert.deepEqual(filterUsers([older, newer, sim, edge], { ...base, segment: "all", month: "2026-11" }), [sim, newer, edge]);
  assert.deepEqual(filterUsers([older, newer, sim, edge], { ...base, segment: "real", month: "2026-09" }), [older]);
});

test("html escapes every interpolated value unless it is already html", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(html`<p>${"<b>"}${html`<i>ok</i>`}${null}${false}${[1, "<", 2]}</p>`.value, "<p>&lt;b&gt;<i>ok</i>1&lt;2</p>");
});

test("the admin document is script-free and escapes hostile account data", () => {
  const hostile = user({ id: adminId, email: `"><script>alert(1)</script>@gmail.com` });
  const rows: AdminAccountRow[] = [
    { user: hostile, wallet: { status: "ok", value: address }, username: { status: "ok", value: "owner_1" }, sentTx: { status: "ok", value: 1234 } },
    { user: user(), wallet: { status: "none" }, username: { status: "none" }, sentTx: { status: "none" } },
    { user: user({ id: "00000000-0000-4000-8000-0000000000cc" }), wallet: { status: "error" }, username: { status: "error" }, sentTx: { status: "error" } },
  ];
  const page = renderAdminDocument("Admin", renderAdminPanel({
    users: [hostile, user(), user({ app_metadata: { synthetic: true } })], walletCount: 2, rows,
    query: { segment: "all", q: `"><script>`, page: 1, month: "" }, page: 1, pages: 1, matches: 3,
    adminIds: new Set([adminId]), viewerId: adminId, viewerEmail: "<i>owner</i>@example.com", now: new Date("2026-11-19T14:30:00Z"), appUrl: "https://salapi.app",
  }));
  assert.match(page, /Masuk sebagai <b>&lt;i&gt;owner&lt;\/i&gt;@example\.com<\/b>/); // admin email, escaped
  assert.doesNotMatch(page, /<script/i);
  assert.match(page, /value="&quot;&gt;&lt;script&gt;"/); // search box attribute
  assert.match(page, /&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;@gmail\.com/);
  assert.match(page, /@owner_1/);
  assert.match(page, new RegExp(`href="https://stellar.expert/explorer/testnet/account/${address}" target="_blank" rel="noopener noreferrer"`));
  assert.match(page, /<span class="count">1\.234<\/span>/); // id-ID thousands separator
  assert.match(page, /Gagal dimuat/);
  assert.match(page, /Belum aktif/);
  assert.match(page, /<span class="pill admin">Admin<\/span>/);
  assert.match(page, /--mono:'Geist Mono'/); // CSS is not entity-escaped
  assert.match(page, /19 November 2026 · 21\.30 WIB/);
  // Two real accounts out of three; the simulation account is excluded.
  assert.match(page, /<span class="eyebrow">Pengguna asli<\/span><strong>2<\/strong>/);
});

test("filter links keep the segment, month and search; real users is the implied default", () => {
  assert.equal(adminHref({ segment: "real", q: "", page: 1, month: "" }, 1), "/#users");
  assert.equal(adminHref({ segment: "all", q: "", page: 1, month: "" }, 1), "/?segment=all#users");
  assert.equal(adminHref({ segment: "qa", q: "a&b", page: 1, month: "2026-10" }, 3), "/?segment=qa&month=2026-10&q=a%26b&page=3#users");
});

test("overview numbers and months link to the matching directory filter", () => {
  const users = [
    user({ created_at: "2026-11-02T03:00:00Z" }),
    user({ created_at: "2026-10-02T03:00:00Z", app_metadata: { synthetic: true } }),
    user({ created_at: "2026-10-03T03:00:00Z", email: "qa@salapi.test" }),
  ];
  const render = (month: string) => renderAdminDocument("Admin", renderAdminPanel({
    users, walletCount: 3, rows: [], query: { segment: "real", q: "", page: 1, month }, page: 1, pages: 1, matches: 0,
    adminIds: new Set(), viewerId: adminId, viewerEmail: "owner@example.com", now: new Date("2026-11-19T14:30:00Z"), appUrl: "https://salapi.app",
  }));
  const page = render("");
  assert.match(page, /<a class="stat-link" href="\/#users"><span class="eyebrow">Pengguna asli<\/span><strong>1<\/strong>/);
  assert.match(page, /<a class="stat-link" href="\/\?segment=all&amp;month=2026-11#users"><span class="eyebrow">Daftar bulan ini<\/span><strong>1<\/strong>/);
  assert.match(page, /<a href="\/\?month=2026-11#users">1 asli<\/a>/);
  assert.match(page, /<a class="stat-link" href="\/\?segment=all#users"><span class="eyebrow">Total akun<\/span><strong>3<\/strong>/);
  assert.match(page, /<a href="\/\?segment=simulation#users">1 simulasi<\/a>/);
  assert.match(page, /<a href="\/\?segment=qa#users">1 QA<\/a>/);
  assert.match(page, /<a class="bar-col" href="\/\?segment=all&amp;month=2026-10#users" aria-label="Okt 2026: 2 pendaftaran, 0 asli">/);
  assert.match(page, /<td><a href="\/\?month=2026-10#users">0<\/a><\/td>/); // the month's "Asli" cell
  // Tabs open on Asli, and no month chip without a month filter.
  assert.match(page, /<nav class="tabs" aria-label="Segmen akun"><a href="\/#users" aria-current="page">Asli <span>1<\/span><\/a><a href="\/\?segment=all#users">Semua <span>3<\/span>/);
  assert.doesNotMatch(page, /class="chip"/);
  // With a month filter, tab counts follow the month and a chip clears it.
  const october = render("2026-10");
  assert.match(october, /<a class="chip" href="\/#users" aria-label="Hapus filter bulan Okt 2026">Daftar Okt 2026/);
  assert.match(october, /Asli <span>0<\/span><\/a><a href="\/\?segment=all&amp;month=2026-10#users">Semua <span>2<\/span>/);
  assert.match(october, /<input type="hidden" name="month" value="2026-10">/);
});

test("gate pages escape the signed-in email and never render account data", () => {
  const denied = renderAdminDocument("Admin", renderAdminGate({ status: "denied", userId: otherId, email: "<b>x</b>@gmail.com" }, "https://salapi.app"));
  assert.match(denied, /&lt;b&gt;x&lt;\/b&gt;@gmail\.com/);
  assert.match(denied, new RegExp(otherId));
  assert.doesNotMatch(denied, /<script/i);
  assert.match(denied, /href="https:\/\/salapi\.app">Kembali ke Salapi/);
  // A browser's default Google account can be the wrong one: offer a switch.
  assert.match(denied, /href="\/signin\?next=%2F">Masuk dengan akun lain/);
  // Sign-in returns to the admin host's root, where the panel lives.
  assert.match(renderAdminDocument("Admin", renderAdminGate({ status: "signin" }, "https://salapi.app")), /href="\/signin\?next=%2F"/);
});

test("the panel is only reachable as / on the admin host, and /admin is 404 everywhere", () => {
  assert.equal(hostHeaderName("Admin.Salapi.app:443"), "admin.salapi.app");
  assert.equal(hostHeaderName("admin.localhost:4848"), "admin.localhost");
  assert.equal(hostHeaderName(null), "");
  for (const host of ["salapi.app", "localhost", "salapi-abc.vercel.app", "admin-salapi.vercel.app"]) {
    assert.equal(adminHostRoute(host, "/"), "pass");
    assert.equal(adminHostRoute(host, "/send"), "pass");
    for (const path of ["/admin", "/admin/", "/admin/x"]) assert.equal(adminHostRoute(host, path), "not-found");
  }
  for (const host of ["admin.salapi.app", "ADMIN.salapi.app", "admin.localhost"]) {
    assert.equal(adminHostRoute(host, "/"), "admin");
    assert.equal(adminHostRoute(host, "/admin"), "not-found");
    for (const path of ["/signin", "/auth/callback", "/api/market-prices", "/_vercel/insights/script.js", "/sw.js", "/icon.svg", "/icon-192.png",
      "/apple-icon.png", "/stellar-white.png", "/manifest.webmanifest"])
      assert.equal(adminHostRoute(host, path), "pass", path);
    // The rest of the app, its APIs and public HTML never share the admin origin,
    // including dynamic routes whose segment merely looks like a file name.
    for (const path of ["/send", "/settings", "/api/account/activity", "/auth", "/auth/other", "/signin/x", "/docs", "/landing", "/landing/index.html",
      "/pitch.html", "/tx/a.b", "/circles/x.png", "/learn/a.svg", "/_next/data/x.json", "/icon-999.png"])
      assert.equal(adminHostRoute(host, path), "not-found", path);
  }
});

// readAdminAccess runs with mocked auth, transpiled like the other server-module tests.
const accessSource = ts.transpileModule(readFileSync(new URL("../lib/server/adminAccess.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type AccessOptions = { preview?: boolean; configured?: boolean; admin?: boolean; ids?: string; user?: unknown; authError?: unknown; authThrows?: unknown };
async function access(o: AccessOptions = {}) {
  const api = {} as { readAdminAccess(): Promise<{ status: string; userId?: string; email?: string | null }> };
  runInNewContext(accessSource, { exports: api, Error, process: { env: { SALAPI_ADMIN_USER_IDS: o.ids ?? adminId } }, require(name: string) {
    if (name === "server-only") return {};
    if (name === "@supabase/supabase-js") return { isAuthSessionMissingError };
    if (name === "@/lib/local-preview") return { isLocalPreview: o.preview ?? false };
    if (name === "@/lib/supabase/env") return { supabaseConfigured: () => o.configured ?? true, supabaseAdminConfigured: () => o.admin ?? true };
    if (name === "@/lib/admin-users") return { parseAdminIds };
    if (name === "@/lib/supabase/server") return { async createSupabaseServer() { return { auth: { async getUser() {
      if (o.authThrows) throw o.authThrows;
      return { data: { user: o.user === undefined ? { id: adminId, email: "owner@example.com", is_anonymous: false } : o.user }, error: o.authError ?? null };
    } } }; } };
    throw Error(`Unexpected dependency ${name}`);
  } });
  return api.readAdminAccess();
}

test("only a listed, non-anonymous user ID gets admin; everything else fails closed", async () => {
  assert.equal((await access()).status, "admin");
  assert.equal((await access()).email, "owner@example.com"); // shown in the panel header
  assert.equal((await access({ ids: adminId.toUpperCase() })).status, "admin");
  assert.deepEqual(JSON.parse(JSON.stringify(await access({ user: { id: otherId, email: "x@gmail.com", is_anonymous: false } }))), { status: "denied", userId: otherId, email: "x@gmail.com" });
  assert.equal((await access({ ids: "" })).status, "denied");
  assert.equal((await access({ user: { id: adminId, is_anonymous: true } })).status, "denied");
  assert.equal((await access({ user: { id: adminId } })).status, "denied");
  // An email match alone is never enough.
  assert.equal((await access({ ids: "owner@example.com" })).status, "denied");
});

test("missing sessions ask to sign in; outages and previews are unavailable, never admin", async () => {
  assert.equal((await access({ user: null })).status, "signin");
  assert.equal((await access({ user: null, authError: new AuthSessionMissingError() })).status, "signin");
  assert.equal((await access({ authThrows: new AuthSessionMissingError() })).status, "signin");
  assert.equal((await access({ user: null, authError: Error("network") })).status, "unavailable");
  assert.equal((await access({ authError: Error("network") })).status, "unavailable");
  assert.equal((await access({ authThrows: Error("network") })).status, "unavailable");
  assert.equal((await access({ user: { id: "" } })).status, "unavailable");
  assert.equal((await access({ preview: true })).status, "unavailable");
  assert.equal((await access({ configured: false })).status, "unavailable");
  assert.equal((await access({ admin: false })).status, "unavailable");
});

// adminDirectory runs with mocked Supabase, registry and Horizon.
const directorySource = ts.transpileModule(readFileSync(new URL("../lib/server/adminDirectory.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
type HorizonReply = { status: number; body?: unknown } | "throw";
type DirectoryOptions = { pages?: unknown[][]; listError?: boolean; wallets?: { user_id: string; public_key: unknown }[]; walletError?: boolean;
  handles?: Record<string, unknown>; horizon?: Record<string, HorizonReply> };
function directory(o: DirectoryOptions = {}) {
  const calls = { list: 0, columns: [] as string[], fetched: [] as string[] };
  const api = {} as { loadAdminDirectory(): Promise<unknown>; loadAccountRows(users: AdminAuthUser[]): Promise<AdminAccountRow[]> };
  const supabase = {
    auth: { admin: { async listUsers({ page }: { page: number }) {
      calls.list++;
      return o.listError ? { data: { users: [] }, error: Error("down") } : { data: { users: o.pages?.[page - 1] ?? [] }, error: null };
    } } },
    from(table: string) {
      assert.equal(table, "wallets");
      return { select(columns: string, options?: unknown) {
        calls.columns.push(columns);
        if (options) return Promise.resolve({ count: o.walletError ? null : (o.wallets ?? []).length, error: o.walletError ? Error("db") : null });
        return { async in(column: string, ids: string[]) {
          assert.equal(column, "user_id");
          return o.walletError ? { data: null, error: Error("db") } : { data: (o.wallets ?? []).filter(w => ids.includes(w.user_id)), error: null };
        } };
      } };
    },
  };
  async function fetch(url: URL) {
    calls.fetched.push(String(url));
    const reply = o.horizon?.[url.pathname.split("/").pop() ?? ""] ?? { status: 404 };
    if (reply === "throw") throw Error("network");
    return { status: reply.status, ok: reply.status >= 200 && reply.status < 300, async json() { return reply.body; } };
  }
  runInNewContext(directorySource, { exports: api, Error, Map, Promise, Array, URL, AbortSignal, setTimeout, clearTimeout, fetch, require(name: string) {
    if (name === "server-only") return {};
    if (name === "@stellar/stellar-sdk") return { StrKey };
    if (name === "@/lib/supabase/admin") return { createSupabaseAdmin: () => supabase };
    if (name === "@/lib/server/stellar") return { CONTRACTS: { usernameRegistry: "registry" }, HORIZON: "https://horizon-testnet.stellar.org", sc: { addr: (x: string) => x },
      async readContract(_id: string, method: string, [owner]: string[]) {
        assert.equal(method, "username_of");
        const value = o.handles?.[owner] ?? Error("Error(Contract, #3)");
        if (value instanceof Error) throw value;
        return value;
      } };
    if (name === "@/lib/username-onboarding") return { USERNAME_PATTERN: /^[a-z0-9_]{3,32}$/ };
    if (name === "@/lib/admin-users") return { sentTransactionCount };
    throw Error(`Unexpected dependency ${name}`);
  } });
  return { api, calls };
}
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test("the directory dedupes paged users, keeps only needed metadata and fails loudly", async () => {
  const full = Array.from({ length: 1000 }, (_, i) => ({ id: `u${i}`, email: `${i}@example.com`, created_at: "2026-11-01T00:00:00Z",
    app_metadata: { provider: "email", synthetic: true, simulation_persona_id: "persona" }, user_metadata: { full_name: "Name", avatar_url: "x" } }));
  const { api, calls } = directory({ pages: [full, [full[999], { id: "last", created_at: "2026-11-02T00:00:00Z" }]], wallets: [{ user_id: "u1", public_key: "G" }] });
  const result = plain(await api.loadAdminDirectory());
  assert.equal(calls.list, 2);
  assert.equal(result.users.length, 1001);
  assert.deepEqual(result.users[0].app_metadata, { provider: "email", synthetic: true });
  assert.deepEqual(result.users[0].user_metadata, {});
  assert.equal(result.walletCount, 1);
  await assert.rejects(directory({ listError: true }).api.loadAdminDirectory());
});

test("account rows separate confirmed absence from failed reads and never select secrets", async () => {
  const other = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
  const third = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
  const accounts = ["a", "b", "c", "d", "e"].map(id => user({ id }));
  const { api, calls } = directory({
    wallets: [{ user_id: "a", public_key: address }, { user_id: "c", public_key: "not-a-key" }, { user_id: "d", public_key: other }, { user_id: "e", public_key: third }],
    handles: { [address]: "owner_1", [other]: Error("rpc down"), [third]: "BAD NAME" },
    horizon: {
      [address]: { status: 200, body: { id: address, sequence: ((77n << 32n) + 12n).toString() } },
      [other]: { status: 200, body: { id: third, sequence: "1" } },
      [third]: "throw",
    },
  });
  const rows = plain(await api.loadAccountRows(accounts));
  assert.deepEqual(rows.map((r: AdminAccountRow) => [r.user.id, r.wallet.status, r.username.status, r.sentTx.status]), [
    ["a", "ok", "ok", "ok"],          // registered username, 12 sent
    ["b", "none", "none", "none"],    // no wallet row
    ["c", "error", "error", "error"], // corrupt stored key, nothing fetched for it
    ["d", "ok", "error", "error"],    // RPC failure; Horizon answered for another account
    ["e", "ok", "error", "error"],    // invalid stored handle; Horizon network error
  ]);
  assert.equal(rows[0].username.value, "owner_1");
  assert.equal(rows[0].sentTx.value, 12);
  assert.deepEqual(calls.columns, ["user_id, public_key"]);
  assert.deepEqual(calls.fetched.sort(), [address, other, third].map(a => `https://horizon-testnet.stellar.org/accounts/${a}`).sort());
  const unfunded = plain(await directory({ wallets: [{ user_id: "a", public_key: address }] }).api.loadAccountRows([user({ id: "a" })]));
  assert.deepEqual([unfunded[0].username.status, unfunded[0].sentTx.status], ["none", "none"]);
  const dbDown = plain(await directory({ walletError: true }).api.loadAccountRows([user({ id: "a" })]));
  assert.deepEqual([dbDown[0].wallet.status, dbDown[0].sentTx.status], ["error", "error"]);
  assert.deepEqual(plain(await directory().api.loadAccountRows([])), []);
});

// Reads back the ZIP the writer produced: local headers in order, deflated bodies, CRC checked.
function unzip(file: Buffer): Map<string, string> {
  const parts = new Map<string, string>();
  let at = 0;
  while (file.readUInt32LE(at) === 0x04034b50) {
    const crc = file.readUInt32LE(at + 14), packedSize = file.readUInt32LE(at + 18), size = file.readUInt32LE(at + 22);
    const nameLength = file.readUInt16LE(at + 26), extraLength = file.readUInt16LE(at + 28);
    const name = file.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extraLength;
    const raw = inflateRawSync(file.subarray(start, start + packedSize));
    assert.equal(raw.length, size, name);
    assert.equal(crc32(raw), crc, name);
    parts.set(name, raw.toString("utf8"));
    at = start + packedSize;
  }
  assert.equal(file.readUInt32LE(at), 0x02014b50); // central directory follows the entries
  const end = file.length - 22;
  assert.equal(file.readUInt32LE(end), 0x06054b50);
  assert.equal(file.readUInt16LE(end + 10), parts.size);
  return parts;
}

test("xlsx helpers: CRC-32, Excel serial dates in WIB, and the dated file name", () => {
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  // 2026-11-19 16:11:30 UTC = 23:11:30 WIB; Excel serial 46345 is 2026-11-19.
  assert.ok(Math.abs((excelWib("2026-11-19T16:11:30Z") as number) - (46345 + (23 * 3600 + 11 * 60 + 30) / 86400)) < 1e-9);
  assert.equal(excelWib(null), null);
  assert.equal(excelWib("not a date"), null);
  assert.equal(excelMonth("2026-11"), 46327);
  assert.equal(excelMonth("2026-01"), 46023);
  assert.equal(xlsxFilename(new Date("2026-11-19T17:30:00Z")), "salapi-akun-asli-2026-11-20.xlsx");
});

test("the Excel export has real columns, @usernames as text, numeric tx, filters, a frozen header and a monthly summary", () => {
  const rows: AdminAccountRow[] = [
    { user: user({ id: adminId, email: "owner@example.com", created_at: "2026-11-19T16:11:30Z", last_sign_in_at: "2026-11-19T16:20:00Z" }),
      wallet: { status: "ok", value: address }, username: { status: "ok", value: "owner_1" }, sentTx: { status: "ok", value: 24 } },
    { user: user({ email: `=HYPERLINK("x")<b>&`, created_at: "2026-10-02T03:00:00Z" }), wallet: { status: "none" }, username: { status: "none" }, sentTx: { status: "none" } },
    { user: user({ created_at: "2026-10-03T03:00:00Z" }), wallet: { status: "ok", value: address }, username: { status: "error" }, sentTx: { status: "error" } },
  ];
  const parts = unzip(adminUsersXlsx(rows, new Set([adminId]), new Date("2026-11-19T17:30:00Z")));
  assert.deepEqual([...parts.keys()], ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]);
  assert.match(parts.get("xl/workbook.xml")!, /<sheet name="Akun asli" sheetId="1" r:id="rId1"\/><sheet name="Ringkasan" sheetId="2" r:id="rId2"\/>/);
  assert.match(parts.get("xl/workbook.xml")!, /'Akun asli'!\$A\$1:\$J\$4/);
  const sheet = parts.get("xl/worksheets/sheet1.xml")!;
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:J4"\/>/);
  for (const [i, title] of ["Tanggal daftar (WIB)", "Bulan daftar", "Email", "Username", "Wallet address", "Tx terkirim", "Login via", "Terakhir masuk (WIB)", "Admin", "User ID"].entries())
    assert.match(sheet, new RegExp(`<c r="${String.fromCharCode(65 + i)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${title.replace(/[()]/g, "\\$&")}</t></is></c>`));
  // Row 2: real Excel date + month cells, separate columns, @username kept as text, numeric tx.
  assert.match(sheet, /<c r="A2" s="2"><v>46345\.96/);
  assert.match(sheet, /<c r="B2" s="3"><v>46327<\/v><\/c>/);
  assert.match(sheet, /<c r="C2" t="inlineStr"><is><t xml:space="preserve">owner@example\.com<\/t>/);
  assert.match(sheet, /<c r="D2" t="inlineStr"><is><t xml:space="preserve">@owner_1<\/t>/);
  assert.match(sheet, new RegExp(`<c r="E2" s="4" t="inlineStr"><is><t xml:space="preserve">${address}</t>`));
  assert.match(sheet, /<c r="F2" s="5"><v>24<\/v><\/c>/);
  assert.match(sheet, /<c r="I2" t="inlineStr"><is><t xml:space="preserve">Ya<\/t>/);
  // Row 3: hostile text is XML-escaped text (never a formula), no username/wallet, 0 tx sent.
  assert.match(sheet, /<c r="C3" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\)&lt;b&gt;&amp;<\/t>/);
  assert.doesNotMatch(sheet, /<f>/);
  assert.doesNotMatch(sheet, /r="D3"|r="E3"/);
  assert.match(sheet, /<c r="F3" s="5"><v>0<\/v><\/c>/);
  // Row 4: failed reads say so instead of looking empty.
  assert.match(sheet, /<c r="D4" t="inlineStr"><is><t xml:space="preserve">gagal dimuat<\/t>/);
  assert.match(sheet, /<c r="F4" t="inlineStr"><is><t xml:space="preserve">gagal dimuat<\/t>/);
  const summary = parts.get("xl/worksheets/sheet2.xml")!;
  assert.match(summary, /Total akun asli<\/t><\/is><\/c><c r="B4" s="5"><v>3<\/v>/);
  assert.match(summary, /Total tx terkirim<\/t><\/is><\/c><c r="B5" s="5"><v>24<\/v>/);
  assert.match(summary, /Akun dengan tx gagal dimuat<\/t><\/is><\/c><c r="B6" s="5"><v>1<\/v>/);
  // Months newest first: Nov 2026 (1 account, 24 tx), then Okt 2026 (2 accounts, 0 tx).
  assert.match(summary, /<row r="9"><c r="A9" s="3"><v>46327<\/v><\/c><c r="B9" s="5"><v>1<\/v><\/c><c r="C9" s="5"><v>24<\/v><\/c><\/row>/);
  assert.match(summary, /<row r="10"><c r="A10" s="3"><v>46296<\/v><\/c><c r="B10" s="5"><v>2<\/v><\/c><c r="C10" s="5"><v>0<\/v><\/c><\/row>/);
});

test("the panel offers the real-accounts Excel export", () => {
  const page = renderAdminDocument("Admin", renderAdminPanel({
    users: [user()], walletCount: 1, rows: [], query: { segment: "qa", q: "", page: 1, month: "2026-10" }, page: 1, pages: 1, matches: 0,
    adminIds: new Set(), viewerId: adminId, viewerEmail: null, now: new Date(), appUrl: "https://salapi.app",
  }));
  assert.match(page, /<a class="button ghost small" href="\/\?format=xlsx" download>⬇ Export akun asli \(Excel\)<\/a>/);
});
