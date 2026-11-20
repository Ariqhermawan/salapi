// Server-rendered, script-free HTML for the admin host (admin.salapi.app). Pure:
// data in, document out. Links are relative to that host's "/"; appUrl is the main app.
import { html, SafeHtml } from "./admin-html.ts";
import { ADMIN_PAGE_SIZE, DEFAULT_SEGMENT, SEGMENT_FILTERS, SEGMENT_LABEL, SORTS, accountSegment, activationFunnel, dailySignups, providerLabel, inMonth, monthlySignups, type AdminAccountRow, type AdminAuthUser, type AdminQuery, type AdminSegmentFilter, type AdminSort, type DailySignups, type SnapshotState } from "./admin-users.ts";

export interface AdminPanelData {
  users: readonly AdminAuthUser[];
  walletCount: number | null;
  rows: readonly AdminAccountRow[];
  query: AdminQuery;
  page: number;
  pages: number;
  matches: number;
  adminIds: ReadonlySet<string>;
  viewerId: string;
  viewerEmail: string | null;
  /** null = no snapshot yet; undefined = the snapshot read failed. */
  snapshot?: SnapshotState | null;
  now: Date;
  appUrl: string;
}
export type AdminGate = { status: "signin" } | { status: "denied"; userId: string; email: string | null } | { status: "unavailable" };

const TZ = "Asia/Jakarta";
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, ...options });
const DAY = fmt({ day: "numeric", month: "short", year: "numeric" });
const TIME = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const LONG = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });
const DAY_SHORT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const SORT_LABEL: Record<AdminSort, string> = { daftar: "Daftar terbaru", masuk: "Terakhir masuk", tx: "Tx terbanyak" };
const number = (value: number) => value.toLocaleString("id-ID");
const valid = (iso: string | null | undefined): iso is string => typeof iso === "string" && Number.isFinite(Date.parse(iso));

export function renderAdminDocument(title: string, body: SafeHtml): string {
  return html`<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><meta name="color-scheme" content="dark"><meta name="theme-color" content="#0a1224">
<title>${title}</title><link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">
<style>${new SafeHtml(STYLES)}</style></head><body>${body}</body></html>`.value;
}

export function renderAdminGate(gate: AdminGate, appUrl: string): SafeHtml {
  const card = (eyebrow: string, title: string, content: SafeHtml) => html`<main class="gate"><section class="gate-card">
    <img src="/icon.svg" alt="" width="44" height="44"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${content}</section></main>`;
  if (gate.status === "signin") return card("SALAPI ADMIN", "Masuk sebagai admin", html`
    <p>Panel ini hanya untuk akun admin Salapi. Masuk dulu, lalu kamu akan kembali ke sini.</p>
    <a class="button" href="/signin?next=%2F">Masuk</a>`);
  if (gate.status === "denied") return card("AKSES DITOLAK", "Akun ini bukan admin", html`
    <p>${gate.email ? html`Kamu masuk sebagai <strong>${gate.email}</strong>, ` : ""}tapi akun ini belum terdaftar sebagai admin.</p>
    <p class="muted">User ID akun ini:</p><code class="id">${gate.userId}</code>
    <p class="muted">Untuk memberi akses, tambahkan User ID di atas ke <code>SALAPI_ADMIN_USER_IDS</code> di Vercel, lalu deploy ulang.</p>
    <div class="gate-actions"><a class="button" href="/signin?next=%2F">Masuk dengan akun lain</a><a class="button ghost" href="${appUrl}">Kembali ke Salapi</a></div>`);
  return card("SALAPI ADMIN", "Panel belum bisa dimuat", html`
    <p>Layanan login atau data akun sedang tidak tersedia. Tidak ada data yang ditampilkan.</p>
    <a class="button" href="/">Coba lagi</a>`);
}

export function renderAdminPanel(data: AdminPanelData): SafeHtml {
  const segments = new Map<AdminSegmentFilter, number>(SEGMENT_FILTERS.map(segment => [segment, 0]));
  for (const user of data.users) {
    const segment = accountSegment(user);
    segments.set(segment, (segments.get(segment) ?? 0) + 1);
  }
  segments.set("all", data.users.length);
  const months = monthlySignups(data.users, data.now);
  const days = dailySignups(data.users, data.now);
  const thisMonth = months.at(-1) ?? { month: "", total: 0, real: 0 };
  const total = data.users.length;
  const count = (segment: AdminSegmentFilter) => number(segments.get(segment) ?? 0);
  return html`<div class="admin">
  <aside class="side">
    <a class="brand" href="#overview"><img src="/icon.svg" alt="" width="30" height="30"><span>Salapi <b>Admin</b></span><em>Testnet</em></a>
    <nav aria-label="Menu admin"><p class="group">Pantau</p><a href="#overview">Ringkasan</a><a href="#users">Pengguna</a></nav>
    <div class="side-foot"><span>Admin</span><strong class="viewer">${data.viewerEmail ?? "Tanpa email"}</strong><code title="${data.viewerId}">${data.viewerId.slice(0, 8)}</code><a href="${data.appUrl}" target="_blank" rel="noopener noreferrer">Buka Salapi ↗</a></div>
  </aside>
  <main>
    <header class="head" id="overview" tabindex="-1">
      <div><h1>Ringkasan admin</h1><p>${LONG.format(data.now)} · ${TIME.format(data.now)} WIB · Stellar Testnet</p>
        <p class="viewer-line">Masuk sebagai <b>${data.viewerEmail ?? data.viewerId}</b> · Admin</p></div>
      <a class="button" href="${adminHref(data.query, data.page)}">↻ Perbarui data</a>
    </header>
    <section class="ribbon" aria-label="Angka utama">
      ${stat("Pengguna asli", count("real"), html`dari <a href="${view({ segment: "all" })}">${number(total)} akun terdaftar</a>`, "blue", view({ segment: "real" }))}
      ${stat("Daftar bulan ini", number(thisMonth.total), thisMonth.month
        ? html`<a href="${view({ segment: "real", month: thisMonth.month })}">${number(thisMonth.real)} asli</a> · ${monthLabel(thisMonth.month)}`
        : html`Belum ada`, "green", view({ segment: "all", month: thisMonth.month }))}
      ${stat("Total akun", number(total), html`<a href="${view({ segment: "team" })}">${count("team")} tim</a> · <a href="${view({ segment: "simulation" })}">${count("simulation")} simulasi</a> · <a href="${view({ segment: "load_test" })}">${count("load_test")} load test</a> · <a href="${view({ segment: "qa" })}">${count("qa")} QA</a>`, "", view({ segment: "all" }))}
      ${stat("Punya wallet", data.walletCount === null ? "Gagal dimuat" : number(data.walletCount), data.walletCount === null || !total ? html`Wallet custodial Testnet` : html`${Math.round(data.walletCount / total * 100)}% dari semua akun`, "violet", view({ segment: "all" }))}
    </section>
    ${renderActivation(data)}
    ${renderMonths(months, days)}
    ${renderUsers(data)}
    <footer class="foot">Salapi Admin · Waktu dalam WIB · Data akun dari Supabase, username dan transaksi dari Stellar Testnet</footer>
  </main>
</div>`;
}

/** The whole card links to the filtered directory; links inside the subtitle stay clickable above it. */
function stat(label: string, value: string, sub: SafeHtml, tone: string, href: string): SafeHtml {
  return html`<div class="stat ${tone}"><a class="stat-link" href="${href}"><span class="eyebrow">${label}</span><strong>${value}</strong><span class="cue" aria-hidden="true">↗</span></a><small>${sub}</small></div>`;
}

/** Directory link for a filter, starting from the default view (real users, page 1). */
function view(filter: Partial<AdminQuery>): string {
  return adminHref({ segment: DEFAULT_SEGMENT, q: "", month: "", page: 1, sort: "daftar", ...filter }, 1);
}

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

function renderMonths(months: readonly { month: string; total: number; real: number }[], days: readonly DailySignups[]): SafeHtml {
  const max = Math.max(1, ...months.map(month => month.total));
  return html`<section class="panel" aria-labelledby="months-title">
    <div class="panel-title"><div><span class="eyebrow">AKUISISI</span><h2 id="months-title">Pendaftaran per bulan</h2></div>
      <div class="legend"><span class="key blue"></span>Asli<span class="key muted"></span>Tim, simulasi, load test, QA</div></div>
    ${months.length ? html`<div class="bars">
      ${months.map(month => html`<a class="bar-col" href="${view({ segment: "all", month: month.month })}" aria-label="${monthLabel(month.month)}: ${number(month.total)} pendaftaran, ${number(month.real)} asli"><span class="bar-value" aria-hidden="true">${month.total || ""}</span>
        <div class="bar"><div class="bar-other" style="height:${((month.total - month.real) / max * 100).toFixed(2)}%"></div><div class="bar-real" style="height:${(month.real / max * 100).toFixed(2)}%"></div></div>
        <span class="bar-label" aria-hidden="true">${monthLabel(month.month)}</span></a>`)}
    </div>
    <table class="mini"><thead><tr><th>Bulan</th><th>Total daftar</th><th>Asli</th><th>Tim &amp; tes</th></tr></thead><tbody>
      ${[...months].reverse().map(month => html`<tr><td><a href="${view({ segment: "all", month: month.month })}">${monthLabel(month.month)}</a></td><td><a href="${view({ segment: "all", month: month.month })}">${number(month.total)}</a></td><td><a href="${view({ segment: "real", month: month.month })}">${number(month.real)}</a></td><td>${number(month.total - month.real)}</td></tr>`)}
    </tbody></table>` : html`<p class="muted">Belum ada pendaftaran.</p>`}
    ${renderDaily(days)}
  </section>`;
}

/** Real accounts from sign-up to repeat use; on-chain steps come from the daily snapshot. */
function renderActivation(data: AdminPanelData): SafeHtml {
  const { snapshot } = data;
  const funnel = activationFunnel(data.users.filter(user => accountSegment(user) === "real"), snapshot ?? null, data.now);
  const base = Math.max(1, funnel.registered);
  const step = (label: string, value: number | null, hint?: string) => html`<div class="step">
      <div class="step-label"><span>${label}${hint ? html`<small>${hint}</small>` : ""}</span><b>${value === null ? "Belum ada data" : number(value)}</b>${value === null ? "" : html`<em>${Math.round(value / base * 100)}%</em>`}</div>
      <div class="step-bar"><i style="width:${value === null ? 0 : (value / base * 100).toFixed(1)}%"></i></div></div>`;
  const onChain = (value: number) => (snapshot ? value : null);
  const status = snapshot === undefined ? "Snapshot gagal dimuat" : snapshot === null ? "Belum ada snapshot"
    : `Snapshot ${DAY.format(new Date(snapshot.capturedAt))}, ${TIME.format(new Date(snapshot.capturedAt))} WIB`;
  return html`<section class="panel" aria-labelledby="funnel-title">
    <div class="panel-title"><div><span class="eyebrow">AKTIVASI · PENGGUNA ASLI</span><h2 id="funnel-title">Dari daftar ke transaksi</h2></div><span class="tag">${status}</span></div>
    <div class="funnel">
      ${step("Terdaftar", funnel.registered)}
      ${step("Punya username", onChain(funnel.username))}
      ${step("Pernah bertransaksi", onChain(funnel.transacted), "≥1 transaksi selain klaim username")}
      ${step("Rutin", onChain(funnel.regular), "≥3 transaksi selain klaim username")}
    </div>
    <div class="active-grid">
      <div><strong>${number(funnel.signedIn7)}</strong><span>Masuk 7 hari terakhir</span></div>
      <div><strong>${number(funnel.signedIn30)}</strong><span>Masuk 30 hari terakhir</span></div>
      <div><strong>${funnel.transacting7 === null ? "Belum ada" : number(funnel.transacting7)}</strong><span>${funnel.transacting7 === null ? "Bertransaksi 7 hari (butuh 7 hari riwayat snapshot)" : "Bertransaksi 7 hari terakhir"}</span></div>
    </div>
    ${snapshot && funnel.covered < funnel.registered ? html`<p class="note">${number(funnel.registered - funnel.covered)} akun asli belum ada di snapshot (daftar setelahnya atau gagal dibaca) dan akan ikut di snapshot berikutnya.</p>` : ""}
    <p class="note">Langkah on-chain diambil dari snapshot harian pukul 00.15 WIB. Klaim username juga dihitung satu transaksi, jadi "bertransaksi" hanya menghitung transaksi di luar itu. Angka ini perkiraan karena percobaan yang gagal di ledger ikut terhitung. Data masuk diambil langsung dari Supabase Auth.</p>
  </section>`;
}

/** Thin stacked bars for the last 30 WIB days; exact counts are in each bar's tooltip. */
function renderDaily(days: readonly DailySignups[]): SafeHtml {
  if (!days.length) return html``;
  const max = Math.max(1, ...days.map(day => day.total));
  const total = days.reduce((sum, day) => sum + day.total, 0), real = days.reduce((sum, day) => sum + day.real, 0);
  const label = (day: string) => DAY_SHORT.format(new Date(`${day}T00:00:00Z`));
  return html`<div class="daily"><div class="daily-head"><span class="eyebrow">30 hari terakhir</span><span class="muted">${number(total)} daftar · ${number(real)} asli</span></div>
    <div class="day-bars" role="img" aria-label="Pendaftaran harian 30 hari terakhir: ${number(total)} daftar, ${number(real)} asli">
      ${days.map(day => html`<span class="day" title="${label(day.day)}: ${number(day.total)} daftar, ${number(day.real)} asli"><i class="day-other" style="height:${((day.total - day.real) / max * 100).toFixed(2)}%"></i><i class="day-real" style="height:${(day.real / max * 100).toFixed(2)}%"></i></span>`)}
    </div>
    <div class="day-axis" aria-hidden="true"><span>${label(days[0].day)}</span><span>${label(days[days.length - 1].day)}</span></div></div>`;
}

function renderUsers(data: AdminPanelData): SafeHtml {
  const { query, page, pages, matches } = data;
  // Tab counts follow the month filter, so each tab says what clicking it shows.
  const scoped = inMonth(data.users, query.month);
  const segments = new Map<AdminSegmentFilter, number>(SEGMENT_FILTERS.map(segment => [segment, 0]));
  for (const user of scoped) segments.set(accountSegment(user), (segments.get(accountSegment(user)) ?? 0) + 1);
  segments.set("all", scoped.length);
  const first = matches ? (page - 1) * ADMIN_PAGE_SIZE + 1 : 0;
  return html`<section class="panel" id="users" aria-labelledby="users-title" tabindex="-1">
    <div class="panel-title"><div><span class="eyebrow">DIREKTORI AKUN</span><h2 id="users-title">Pengguna</h2></div>
      <div class="title-actions"><span class="tag">${number(matches)} akun</span><a class="button ghost small" href="/?format=xlsx" download>⬇ Export akun asli (Excel)</a></div></div>
    <div class="tools">
      <nav class="tabs" aria-label="Segmen akun">${SEGMENT_FILTERS.map(segment => html`<a href="${adminHref({ ...query, segment }, 1)}"${segment === query.segment ? html` aria-current="page"` : ""}>${SEGMENT_LABEL[segment]} <span>${number(segments.get(segment) ?? 0)}</span></a>`)}</nav>
      ${query.month ? html`<a class="chip" href="${adminHref({ ...query, month: "" }, 1)}" aria-label="Hapus filter bulan ${monthLabel(query.month)}">Daftar ${monthLabel(query.month)} <span aria-hidden="true">✕</span></a>` : ""}
      <form class="search" method="get" action="/#users" role="search">
        <input type="hidden" name="segment" value="${query.segment}">${query.month ? html`<input type="hidden" name="month" value="${query.month}">` : ""}${query.sort !== "daftar" ? html`<input type="hidden" name="sort" value="${query.sort}">` : ""}
        <label class="sr" for="admin-q">Cari email atau User ID</label>
        <input id="admin-q" type="search" name="q" value="${query.q}" maxlength="100" placeholder="Cari email atau User ID" autocomplete="off">
        <button class="button" type="submit">Cari</button>${query.q ? html`<a class="clear" href="${adminHref({ ...query, q: "" }, 1)}">Hapus</a>` : ""}
      </form>
    </div>
    <nav class="sorts" aria-label="Urutan"><span class="muted">Urutkan</span>${SORTS.filter(sort => sort !== "tx" || data.snapshot).map(sort => html`<a href="${adminHref({ ...query, sort }, 1)}"${sort === query.sort ? html` aria-current="page"` : ""}>${SORT_LABEL[sort]}</a>`)}</nav>
    ${data.rows.length ? html`<div class="table-wrap"><table class="users">
      <thead><tr><th>Daftar</th><th>Akun</th><th>Username</th><th>Wallet</th><th class="num">Tx terkirim</th></tr></thead>
      <tbody>${data.rows.map(row => renderRow(row, data.adminIds))}</tbody></table></div>
      <div class="pager"><span>Menampilkan ${number(first)} sampai ${number(first + data.rows.length - 1)} dari ${number(matches)}</span>
        <span>${page > 1 ? html`<a href="${adminHref(query, page - 1)}">← Sebelumnya</a>` : ""}<b>Halaman ${number(page)} dari ${number(pages)}</b>${page < pages ? html`<a href="${adminHref(query, page + 1)}">Berikutnya →</a>` : ""}</span></div>`
      : html`<p class="empty">Tidak ada akun yang cocok.</p>`}
    <p class="note"><b>Tx terkirim</b> dihitung dari sequence number wallet di Stellar Testnet: jumlah transaksi yang dikirim dari wallet itu, termasuk yang gagal di ledger, tanpa dana masuk. Riwayat lengkap ada di tautan Stellar Expert. <b>Export akun asli (Excel)</b> berisi semua akun asli (bukan hanya halaman ini) dengan kolom terpisah, filter per bulan, dan sheet Ringkasan berisi total tx. <b>Asli</b> berarti di luar akun tim (admin dan akun internal), simulasi, load test, dan akun QA (.invalid atau .test).</p>
  </section>`;
}

function renderRow({ user, wallet, username, sentTx }: AdminAccountRow, adminIds: ReadonlySet<string>): SafeHtml {
  const segment = accountSegment(user);
  const provider = providerLabel(user);
  const failed = html`<span class="warn">Gagal dimuat</span>`;
  return html`<tr>
    <td data-label="Daftar">${valid(user.created_at) ? html`<span class="strong">${DAY.format(new Date(user.created_at))}</span><small>${TIME.format(new Date(user.created_at))} WIB</small>` : "Tidak diketahui"}
      <small>${valid(user.last_sign_in_at) ? html`Masuk terakhir ${DAY.format(new Date(user.last_sign_in_at))}` : "Belum pernah masuk"}</small></td>
    <td data-label="Akun"><span class="strong email">${user.email || "Tanpa email"}</span>
      <small><span class="pill ${segment}">${SEGMENT_LABEL[segment]}</span>${adminIds.has(user.id.toLowerCase()) ? html`<span class="pill admin">Admin</span>` : ""}${provider} · <code title="${user.id}">${user.id.slice(0, 8)}</code></small></td>
    <td data-label="Username">${username.status === "ok" ? html`<span class="handle">@${username.value}</span>` : username.status === "none" ? html`<span class="muted">Belum dibuat</span>` : failed}</td>
    <td data-label="Wallet">${wallet.status === "ok" ? html`<a class="addr" href="https://stellar.expert/explorer/testnet/account/${wallet.value}" target="_blank" rel="noopener noreferrer">${wallet.value}</a>` : wallet.status === "none" ? html`<span class="muted">Belum dibuat</span>` : failed}</td>
    <td class="num" data-label="Tx terkirim">${sentTx.status === "ok" ? html`<span class="count">${number(sentTx.value)}</span>` : sentTx.status === "none" ? html`<span class="muted">Belum aktif</span>` : failed}</td>
  </tr>`;
}

/** Admin-host link that keeps the active filters. */
export function adminHref(query: AdminQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.segment !== DEFAULT_SEGMENT) params.set("segment", query.segment);
  if (query.month) params.set("month", query.month);
  if (query.q) params.set("q", query.q);
  if (query.sort !== "daftar") params.set("sort", query.sort);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/${search ? `?${search}` : ""}#users`;
}

const STYLES = `
:root{--bg:#0a1224;--panel:#101b33;--panel2:#15223f;--line:rgba(150,172,214,.14);--ink:#eef3fb;--ink2:#a9b6cc;--ink3:#7586a3;--blue:#7aa2ff;--action:#2563eb;--green:#34d399;--violet:#b9a6ff;--amber:#f5b454;--mono:'Geist Mono',ui-monospace,monospace}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--blue)}:focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:6px}
h1,h2{margin:0;letter-spacing:-.02em}code{font-family:var(--mono)}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.eyebrow{font:500 11px/1 var(--mono);letter-spacing:.12em;color:var(--ink3);text-transform:uppercase}
.muted{color:var(--ink3)}.warn{color:var(--amber)}
.button{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;padding:9px 14px;background:var(--action);color:#fff;font:600 13px 'Geist',sans-serif;text-decoration:none;cursor:pointer;transition:background .15s,transform .15s}
.button:hover{background:#1d4ed8}.button:active{transform:translateY(1px)}.button.ghost{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.admin{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh}
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:28px;padding:22px 16px;border-right:1px solid var(--line);background:linear-gradient(180deg,#0d1730,#0a1224)}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);text-decoration:none;font-weight:600;font-size:15px}.brand span{white-space:nowrap}.brand b{color:var(--blue);font-weight:600}
.brand em{margin-left:auto;font:500 10px var(--mono);font-style:normal;letter-spacing:.08em;color:var(--green);border:1px solid rgba(52,211,153,.35);padding:2px 6px;border-radius:999px}
.side nav{display:flex;flex-direction:column;gap:2px}.group{margin:0 0 6px 10px;font:500 11px var(--mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink3)}
.side nav a{padding:8px 10px;border-radius:8px;color:var(--ink2);text-decoration:none;font-weight:500}.side nav a:hover{background:var(--panel2);color:var(--ink)}
.side-foot{margin-top:auto;display:grid;gap:4px;font-size:12px;color:var(--ink3)}.side-foot code{color:var(--ink2)}.side-foot a{margin-top:6px;text-decoration:none}
main{padding:28px clamp(16px,3vw,40px) 48px;display:grid;gap:20px;align-content:start;min-width:0}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}.head h1{font-size:30px;font-weight:650}.head p{margin:4px 0 0;color:var(--ink3)}.head .viewer-line{margin-top:2px;font-size:13px}.viewer-line b{color:var(--ink2);font-weight:600}
.viewer{color:var(--ink);font-weight:600;word-break:break-all}
.ribbon{display:grid;grid-template-columns:1.35fr repeat(3,1fr);border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--panel)}
.stat{display:grid;gap:8px;align-content:start;padding:18px 20px;border-left:1px solid var(--line);position:relative;transition:background .15s}
.stat-link{display:grid;gap:8px;color:inherit;text-decoration:none}.stat-link::after{content:"";position:absolute;inset:0}
.stat:hover{background:rgba(122,162,255,.07)}.stat:focus-within{box-shadow:inset 0 0 0 2px var(--blue)}.stat-link:focus-visible{outline:none}
.cue{position:absolute;top:16px;right:18px;font-size:13px;color:var(--ink3);transition:color .15s,transform .15s}.stat:hover .cue{color:var(--blue);transform:translate(2px,-2px)}
.stat small a{position:relative;z-index:1;color:var(--ink2);text-decoration:underline;text-decoration-color:rgba(169,182,204,.35);text-underline-offset:3px}.stat small a:hover{color:var(--blue)}.stat:first-child{border-left:0;background:linear-gradient(135deg,rgba(37,99,235,.22),transparent 70%)}
.stat strong{font:500 34px/1 var(--mono);letter-spacing:-.03em;font-variant-numeric:tabular-nums}.stat:first-child strong{font-size:44px}
.stat small{color:var(--ink3);font-size:12px}.stat.blue strong{color:#cfdcff}.stat.green strong{color:var(--green)}.stat.violet strong{color:var(--violet)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;min-width:0;scroll-margin-top:16px}
.panel-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px;flex-wrap:wrap}.panel-title h2{font-size:18px;margin-top:6px;font-weight:600}
.tag{font:500 12px var(--mono);color:var(--ink2);background:var(--panel2);padding:5px 10px;border-radius:999px}
.title-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.button.small{padding:7px 12px;font-size:12px}
.legend{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink3)}.key{width:10px;height:10px;border-radius:3px;margin-left:8px}.key.blue{background:var(--action)}.key.muted{background:#3a4867}
.bars{display:flex;align-items:flex-end;gap:14px;height:190px;padding:0 4px 4px;border-bottom:1px solid var(--line);overflow-x:auto}
.bar-col{flex:1 1 0;min-width:52px;max-width:96px;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;text-decoration:none;border-radius:8px;transition:background .15s}.bar-col:hover{background:rgba(122,162,255,.07)}.bar-col:hover .bar-label{color:var(--blue)}.bar{flex:1;width:min(44px,70%);display:flex;flex-direction:column;justify-content:flex-end}
.bar-real{background:linear-gradient(180deg,#5b8cff,var(--action));border-radius:0 0 6px 6px}.bar-other{background:#3a4867;border-radius:6px 6px 0 0}.bar-real:first-child,.bar-other:last-child{border-radius:6px}
.bar-value{font:500 12px var(--mono);color:var(--ink2)}.bar-label{font:500 11px var(--mono);color:var(--ink3);white-space:nowrap}
table{width:100%;border-collapse:collapse}th{text-align:left;font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}tbody tr:hover td{background:rgba(122,162,255,.05)}
.mini{margin-top:14px;font-variant-numeric:tabular-nums}.mini th{white-space:normal}.mini td{padding:8px 12px;color:var(--ink2)}.mini td:first-child{color:var(--ink)}.mini td a{color:inherit;text-decoration:none}.mini td a:hover{color:var(--blue);text-decoration:underline}.mini tbody tr:hover td{background:rgba(122,162,255,.05)}
.tools{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.tabs{display:flex;gap:4px;flex-wrap:wrap;background:var(--bg);padding:4px;border-radius:12px;border:1px solid var(--line)}
.tabs a{padding:6px 11px;border-radius:9px;color:var(--ink2);text-decoration:none;font-weight:500;font-size:13px}.tabs a span{font:500 11px var(--mono);color:var(--ink3);margin-left:4px}
.tabs a:hover{color:var(--ink)}.tabs a[aria-current]{background:var(--panel2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.chip{display:inline-flex;align-items:center;gap:8px;align-self:center;padding:6px 10px;border-radius:999px;background:rgba(37,99,235,.18);color:#cfdcff;text-decoration:none;font-size:13px;font-weight:500}.chip:hover{background:rgba(37,99,235,.3)}
.search{display:flex;gap:8px;align-items:center;margin-left:auto}.search input[type=search]{width:min(280px,60vw);background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit}
.search input::placeholder{color:var(--ink3)}.clear{font-size:13px}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}.users{min-width:880px}
.users td small{display:block;color:var(--ink3);font-size:12px;margin-top:2px}.strong{font-weight:600}.email{word-break:break-all}
.users code{font-size:11px;color:var(--ink3)}.handle{font-weight:600;color:var(--blue)}
.addr{font:12px/1.45 var(--mono);color:var(--ink2);word-break:break-all;display:inline-block;max-width:30ch;text-decoration:none;border-bottom:1px dashed rgba(122,162,255,.35)}.addr:hover{color:var(--blue)}
.num{text-align:right}.count{font:500 18px var(--mono);font-variant-numeric:tabular-nums}
.pill{display:inline-block;font:500 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 6px;border-radius:6px;margin-right:6px;background:var(--panel2);color:var(--ink2)}
.pill.real{background:rgba(52,211,153,.14);color:var(--green)}.pill.simulation{background:rgba(185,166,255,.14);color:var(--violet)}.pill.load_test{background:rgba(245,180,84,.14);color:var(--amber)}.pill.admin{background:rgba(37,99,235,.25);color:#cfdcff}.pill.team{background:rgba(52,211,153,.08);color:#9fe7c9;box-shadow:inset 0 0 0 1px rgba(52,211,153,.3)}
.daily{margin-top:18px;padding-top:16px;border-top:1px solid var(--line)}.daily-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:10px;font-size:12px}
.day-bars{display:flex;align-items:flex-end;gap:3px;height:64px}.day{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;border-radius:3px;transition:background .15s}.day:hover{background:rgba(122,162,255,.12)}
.day-real,.day-other{display:block;width:100%}.day-real{background:var(--action);border-radius:0 0 2px 2px}.day-other{background:#3a4867;border-radius:2px 2px 0 0}.day-real:first-child,.day-other:last-child{border-radius:2px}
.day-axis{display:flex;justify-content:space-between;margin-top:6px;font:500 11px var(--mono);color:var(--ink3)}
.funnel{display:grid;gap:14px}.step-label{display:flex;align-items:baseline;gap:10px}.step-label span{flex:1;color:var(--ink2)}.step-label span small{display:block;color:var(--ink3);font-size:12px}
.step-label b{font:500 20px var(--mono);font-variant-numeric:tabular-nums}.step-label em{font:500 12px var(--mono);font-style:normal;color:var(--ink3);min-width:42px;text-align:right}
.step-bar{height:8px;margin-top:6px;background:var(--bg);border-radius:999px;overflow:hidden}.step-bar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--action),#5b8cff)}
.active-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.active-grid div{display:grid;gap:4px;padding:12px 14px;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.active-grid strong{font:500 22px var(--mono)}.active-grid span{font-size:12px;color:var(--ink3)}@media (max-width:640px){.active-grid{grid-template-columns:1fr}}
.sorts{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:-4px 0 12px;font-size:12px}.sorts .muted{margin-right:6px}.sorts a{padding:4px 9px;border-radius:999px;color:var(--ink2);text-decoration:none}.sorts a:hover{color:var(--ink)}.sorts a[aria-current]{background:var(--panel2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.pager{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--ink3)}.pager span:last-child{display:flex;gap:14px;align-items:center}.pager b{color:var(--ink2);font-weight:500}.pager a{text-decoration:none}
.empty{padding:28px;text-align:center;color:var(--ink3);border:1px dashed var(--line);border-radius:12px}
.note{margin:14px 0 0;font-size:12px;color:var(--ink3);max-width:110ch}.note b{color:var(--ink2);font-weight:600}
.foot{font-size:12px;color:var(--ink3);text-align:center}
.gate{min-height:100vh;display:grid;place-content:center;grid-template-columns:min(440px,100%);padding:16px;background:radial-gradient(60% 50% at 50% 0%,rgba(37,99,235,.18),transparent)}
.gate-card{display:grid;gap:12px;justify-items:start;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:28px}
.gate-card h1{font-size:24px}.gate-actions{display:flex;flex-wrap:wrap;gap:8px}.gate-card p{margin:0;color:var(--ink2)}.gate-card .muted{color:var(--ink3);font-size:13px}.gate-card .button{margin-top:8px}
.id{display:block;width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:10px;font-size:13px;word-break:break-all;user-select:all}
@media (max-width:1100px){.ribbon{grid-template-columns:1fr 1fr}.stat:nth-child(3){border-left:0}.stat:nth-child(n+3){border-top:1px solid var(--line)}}
@media (max-width:860px){.admin{grid-template-columns:1fr}.side{position:static;height:auto;flex-direction:row;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 16px;border-right:0;border-bottom:1px solid var(--line)}
.brand em{margin-left:8px}.side nav{flex-direction:row;margin-left:auto}.group,.side-foot{display:none}main{padding:20px 16px 40px}.head h1{font-size:24px}}
@media (max-width:520px){.ribbon{grid-template-columns:1fr}.stat{border-left:0;border-top:1px solid var(--line)}.stat:first-child{border-top:0}.search{width:100%}.search input[type=search]{flex:1;width:auto}}
@media (max-width:640px){.table-wrap{border:0;overflow:visible}.users{min-width:0}.users thead{display:none}.users,.users tbody,.users tr,.users td{display:block;width:100%}
.users tr{border:1px solid var(--line);border-radius:12px;padding:6px 0;margin-bottom:10px;background:var(--panel2)}.users td{border:0;padding:6px 14px}.users td::before{content:attr(data-label);display:block;font:500 10px/1.6 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.users td.num{text-align:left}.addr{max-width:none}tbody tr:hover td{background:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
