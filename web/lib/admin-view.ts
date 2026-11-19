// Server-rendered, script-free HTML for /admin. Pure: data in, document out.
import { html, SafeHtml } from "./admin-html.ts";
import { ADMIN_PAGE_SIZE, SEGMENT_FILTERS, accountSegment, monthlySignups, type AdminAccountRow, type AdminAuthUser, type AdminQuery, type AdminSegmentFilter } from "./admin-users.ts";

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
  now: Date;
}
export type AdminGate = { status: "signin" } | { status: "denied"; userId: string; email: string | null } | { status: "unavailable" };

const SEGMENT_LABEL: Record<AdminSegmentFilter, string> = { all: "Semua", real: "Asli", simulation: "Simulasi", load_test: "Load test", qa: "QA" };
const TZ = "Asia/Jakarta";
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: TZ, ...options });
const DAY = fmt({ day: "numeric", month: "short", year: "numeric" });
const TIME = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const LONG = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const MONTH = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });
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

export function renderAdminGate(gate: AdminGate): SafeHtml {
  const card = (eyebrow: string, title: string, content: SafeHtml) => html`<main class="gate"><section class="gate-card">
    <img src="/icon.svg" alt="" width="44" height="44"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${content}</section></main>`;
  if (gate.status === "signin") return card("SALAPI ADMIN", "Masuk sebagai admin", html`
    <p>Panel ini hanya untuk akun admin Salapi. Masuk dulu, lalu kamu akan kembali ke sini.</p>
    <a class="button" href="/signin?next=%2Fadmin">Masuk</a>`);
  if (gate.status === "denied") return card("AKSES DITOLAK", "Akun ini bukan admin", html`
    <p>${gate.email ? html`Kamu masuk sebagai <strong>${gate.email}</strong>, ` : ""}tapi akun ini belum terdaftar sebagai admin.</p>
    <p class="muted">User ID akun ini:</p><code class="id">${gate.userId}</code>
    <p class="muted">Untuk memberi akses, tambahkan User ID di atas ke <code>SALAPI_ADMIN_USER_IDS</code> di Vercel, lalu deploy ulang.</p>
    <a class="button ghost" href="/">Kembali ke Salapi</a>`);
  return card("SALAPI ADMIN", "Panel belum bisa dimuat", html`
    <p>Layanan login atau data akun sedang tidak tersedia. Tidak ada data yang ditampilkan.</p>
    <a class="button" href="/admin">Coba lagi</a>`);
}

export function renderAdminPanel(data: AdminPanelData): SafeHtml {
  const segments = new Map<AdminSegmentFilter, number>(SEGMENT_FILTERS.map(segment => [segment, 0]));
  for (const user of data.users) {
    const segment = accountSegment(user);
    segments.set(segment, (segments.get(segment) ?? 0) + 1);
  }
  segments.set("all", data.users.length);
  const months = monthlySignups(data.users, data.now);
  const thisMonth = months.at(-1) ?? { month: "", total: 0, real: 0 };
  const total = data.users.length;
  return html`<div class="admin">
  <aside class="side">
    <a class="brand" href="#overview"><img src="/icon.svg" alt="" width="30" height="30"><span>Salapi <b>Admin</b></span><em>Testnet</em></a>
    <nav aria-label="Menu admin"><p class="group">Pantau</p><a href="#overview">Ringkasan</a><a href="#users">Pengguna</a></nav>
    <div class="side-foot"><span>Admin</span><code title="${data.viewerId}">${data.viewerId.slice(0, 8)}</code><a href="/">Buka Salapi ↗</a></div>
  </aside>
  <main>
    <header class="head" id="overview" tabindex="-1">
      <div><h1>Ringkasan admin</h1><p>${LONG.format(data.now)} · ${TIME.format(data.now)} WIB · Stellar Testnet</p></div>
      <a class="button" href="${adminHref(data.query, data.page)}">↻ Perbarui data</a>
    </header>
    <section class="ribbon" aria-label="Angka utama">
      ${stat("Pengguna asli", number(segments.get("real") ?? 0), html`dari ${number(total)} akun terdaftar`, "blue")}
      ${stat("Daftar bulan ini", number(thisMonth.total), html`${number(thisMonth.real)} asli · ${thisMonth.month ? monthLabel(thisMonth.month) : "Belum ada"}`, "green")}
      ${stat("Total akun", number(total), html`${number(segments.get("simulation") ?? 0)} simulasi · ${number(segments.get("load_test") ?? 0)} load test · ${number(segments.get("qa") ?? 0)} QA`, "")}
      ${stat("Punya wallet", data.walletCount === null ? "Gagal dimuat" : number(data.walletCount), data.walletCount === null || !total ? html`Wallet custodial Testnet` : html`${Math.round(data.walletCount / total * 100)}% dari semua akun`, "violet")}
    </section>
    ${renderMonths(months)}
    ${renderUsers(data, segments)}
    <footer class="foot">Salapi Admin · Waktu dalam WIB · Data akun dari Supabase, username dan transaksi dari Stellar Testnet</footer>
  </main>
</div>`;
}

function stat(label: string, value: string, sub: SafeHtml, tone: string): SafeHtml {
  return html`<div class="stat ${tone}"><span class="eyebrow">${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
}

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

function renderMonths(months: readonly { month: string; total: number; real: number }[]): SafeHtml {
  const max = Math.max(1, ...months.map(month => month.total));
  return html`<section class="panel" aria-labelledby="months-title">
    <div class="panel-title"><div><span class="eyebrow">AKUISISI</span><h2 id="months-title">Pendaftaran per bulan</h2></div>
      <div class="legend"><span class="key blue"></span>Asli<span class="key muted"></span>Simulasi, load test, QA</div></div>
    ${months.length ? html`<div class="bars" role="img" aria-label="Grafik pendaftaran per bulan, angka lengkap ada di tabel di bawahnya">
      ${months.map(month => html`<div class="bar-col"><span class="bar-value">${month.total || ""}</span>
        <div class="bar"><div class="bar-other" style="height:${((month.total - month.real) / max * 100).toFixed(2)}%"></div><div class="bar-real" style="height:${(month.real / max * 100).toFixed(2)}%"></div></div>
        <span class="bar-label">${monthLabel(month.month)}</span></div>`)}
    </div>
    <table class="mini"><thead><tr><th>Bulan</th><th>Total daftar</th><th>Asli</th><th>Simulasi, load test, QA</th></tr></thead><tbody>
      ${[...months].reverse().map(month => html`<tr><td>${monthLabel(month.month)}</td><td>${number(month.total)}</td><td>${number(month.real)}</td><td>${number(month.total - month.real)}</td></tr>`)}
    </tbody></table>` : html`<p class="muted">Belum ada pendaftaran.</p>`}
  </section>`;
}

function renderUsers(data: AdminPanelData, segments: ReadonlyMap<AdminSegmentFilter, number>): SafeHtml {
  const { query, page, pages, matches } = data;
  const first = matches ? (page - 1) * ADMIN_PAGE_SIZE + 1 : 0;
  return html`<section class="panel" id="users" aria-labelledby="users-title" tabindex="-1">
    <div class="panel-title"><div><span class="eyebrow">DIREKTORI AKUN</span><h2 id="users-title">Pengguna</h2></div><span class="tag">${number(matches)} akun</span></div>
    <div class="tools">
      <nav class="tabs" aria-label="Segmen akun">${SEGMENT_FILTERS.map(segment => html`<a href="${adminHref({ ...query, segment }, 1)}"${segment === query.segment ? html` aria-current="page"` : ""}>${SEGMENT_LABEL[segment]} <span>${number(segments.get(segment) ?? 0)}</span></a>`)}</nav>
      <form class="search" method="get" action="/admin#users" role="search">
        <input type="hidden" name="segment" value="${query.segment}">
        <label class="sr" for="admin-q">Cari email atau User ID</label>
        <input id="admin-q" type="search" name="q" value="${query.q}" maxlength="100" placeholder="Cari email atau User ID" autocomplete="off">
        <button class="button" type="submit">Cari</button>${query.q ? html`<a class="clear" href="${adminHref({ ...query, q: "" }, 1)}">Hapus</a>` : ""}
      </form>
    </div>
    ${data.rows.length ? html`<div class="table-wrap"><table class="users">
      <thead><tr><th>Daftar</th><th>Akun</th><th>Username</th><th>Wallet</th><th class="num">Tx terkirim</th></tr></thead>
      <tbody>${data.rows.map(row => renderRow(row, data.adminIds))}</tbody></table></div>
      <div class="pager"><span>Menampilkan ${number(first)} sampai ${number(first + data.rows.length - 1)} dari ${number(matches)}</span>
        <span>${page > 1 ? html`<a href="${adminHref(query, page - 1)}">← Sebelumnya</a>` : ""}<b>Halaman ${number(page)} dari ${number(pages)}</b>${page < pages ? html`<a href="${adminHref(query, page + 1)}">Berikutnya →</a>` : ""}</span></div>`
      : html`<p class="empty">Tidak ada akun yang cocok.</p>`}
    <p class="note"><b>Tx terkirim</b> dihitung dari sequence number wallet di Stellar Testnet: jumlah transaksi yang dikirim dari wallet itu, termasuk yang gagal di ledger, tanpa dana masuk. Riwayat lengkap ada di tautan Stellar Expert. <b>Asli</b> berarti di luar simulasi, load test, dan akun QA (.invalid atau .test), termasuk akun tim.</p>
  </section>`;
}

function renderRow({ user, wallet, username, sentTx }: AdminAccountRow, adminIds: ReadonlySet<string>): SafeHtml {
  const segment = accountSegment(user);
  const provider = user.app_metadata?.provider === "google" ? "Google" : user.app_metadata?.provider === "email" ? "Email" : "Lainnya";
  const failed = html`<span class="warn">Gagal dimuat</span>`;
  return html`<tr>
    <td>${valid(user.created_at) ? html`<span class="strong">${DAY.format(new Date(user.created_at))}</span><small>${TIME.format(new Date(user.created_at))} WIB</small>` : "Tidak diketahui"}
      <small>${valid(user.last_sign_in_at) ? html`Masuk terakhir ${DAY.format(new Date(user.last_sign_in_at))}` : "Belum pernah masuk"}</small></td>
    <td><span class="strong email">${user.email || "Tanpa email"}</span>
      <small><span class="pill ${segment}">${SEGMENT_LABEL[segment]}</span>${adminIds.has(user.id.toLowerCase()) ? html`<span class="pill admin">Admin</span>` : ""}${provider} · <code title="${user.id}">${user.id.slice(0, 8)}</code></small></td>
    <td>${username.status === "ok" ? html`<span class="handle">@${username.value}</span>` : username.status === "none" ? html`<span class="muted">Belum dibuat</span>` : failed}</td>
    <td>${wallet.status === "ok" ? html`<a class="addr" href="https://stellar.expert/explorer/testnet/account/${wallet.value}" target="_blank" rel="noopener noreferrer">${wallet.value}</a>` : wallet.status === "none" ? html`<span class="muted">Belum dibuat</span>` : failed}</td>
    <td class="num">${sentTx.status === "ok" ? html`<span class="count">${number(sentTx.value)}</span>` : sentTx.status === "none" ? html`<span class="muted">Belum aktif</span>` : failed}</td>
  </tr>`;
}

/** Relative /admin link that keeps the active filters. */
export function adminHref(query: AdminQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.segment !== "all") params.set("segment", query.segment);
  if (query.q) params.set("q", query.q);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return `/admin${search ? `?${search}` : ""}#users`;
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
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}.head h1{font-size:30px;font-weight:650}.head p{margin:4px 0 0;color:var(--ink3)}
.ribbon{display:grid;grid-template-columns:1.35fr repeat(3,1fr);border:1px solid var(--line);border-radius:18px;overflow:hidden;background:var(--panel)}
.stat{display:grid;gap:8px;padding:18px 20px;border-left:1px solid var(--line);position:relative}.stat:first-child{border-left:0;background:linear-gradient(135deg,rgba(37,99,235,.22),transparent 70%)}
.stat strong{font:500 34px/1 var(--mono);letter-spacing:-.03em;font-variant-numeric:tabular-nums}.stat:first-child strong{font-size:44px}
.stat small{color:var(--ink3);font-size:12px}.stat.blue strong{color:#cfdcff}.stat.green strong{color:var(--green)}.stat.violet strong{color:var(--violet)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:20px;min-width:0;scroll-margin-top:16px}
.panel-title{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:18px;flex-wrap:wrap}.panel-title h2{font-size:18px;margin-top:6px;font-weight:600}
.tag{font:500 12px var(--mono);color:var(--ink2);background:var(--panel2);padding:5px 10px;border-radius:999px}
.legend{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--ink3)}.key{width:10px;height:10px;border-radius:3px;margin-left:8px}.key.blue{background:var(--action)}.key.muted{background:#3a4867}
.bars{display:flex;align-items:flex-end;gap:14px;height:190px;padding:0 4px 4px;border-bottom:1px solid var(--line);overflow-x:auto}
.bar-col{flex:1 1 0;min-width:52px;max-width:96px;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%}.bar{flex:1;width:min(44px,70%);display:flex;flex-direction:column;justify-content:flex-end}
.bar-real{background:linear-gradient(180deg,#5b8cff,var(--action));border-radius:0 0 6px 6px}.bar-other{background:#3a4867;border-radius:6px 6px 0 0}.bar-real:first-child,.bar-other:last-child{border-radius:6px}
.bar-value{font:500 12px var(--mono);color:var(--ink2)}.bar-label{font:500 11px var(--mono);color:var(--ink3);white-space:nowrap}
table{width:100%;border-collapse:collapse}th{text-align:left;font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}tbody tr:hover td{background:rgba(122,162,255,.05)}
.mini{margin-top:14px;font-variant-numeric:tabular-nums}.mini th{white-space:normal}.mini td{padding:8px 12px;color:var(--ink2)}.mini td:first-child{color:var(--ink)}
.tools{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.tabs{display:flex;gap:4px;flex-wrap:wrap;background:var(--bg);padding:4px;border-radius:12px;border:1px solid var(--line)}
.tabs a{padding:6px 11px;border-radius:9px;color:var(--ink2);text-decoration:none;font-weight:500;font-size:13px}.tabs a span{font:500 11px var(--mono);color:var(--ink3);margin-left:4px}
.tabs a:hover{color:var(--ink)}.tabs a[aria-current]{background:var(--panel2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.search{display:flex;gap:8px;align-items:center}.search input[type=search]{width:min(280px,60vw);background:var(--bg);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit}
.search input::placeholder{color:var(--ink3)}.clear{font-size:13px}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}.users{min-width:880px}
.users td small{display:block;color:var(--ink3);font-size:12px;margin-top:2px}.strong{font-weight:600}.email{word-break:break-all}
.users code{font-size:11px;color:var(--ink3)}.handle{font-weight:600;color:var(--blue)}
.addr{font:12px/1.45 var(--mono);color:var(--ink2);word-break:break-all;display:inline-block;max-width:30ch;text-decoration:none;border-bottom:1px dashed rgba(122,162,255,.35)}.addr:hover{color:var(--blue)}
.num{text-align:right}.count{font:500 18px var(--mono);font-variant-numeric:tabular-nums}
.pill{display:inline-block;font:500 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 6px;border-radius:6px;margin-right:6px;background:var(--panel2);color:var(--ink2)}
.pill.real{background:rgba(52,211,153,.14);color:var(--green)}.pill.simulation{background:rgba(185,166,255,.14);color:var(--violet)}.pill.load_test{background:rgba(245,180,84,.14);color:var(--amber)}.pill.admin{background:rgba(37,99,235,.25);color:#cfdcff}
.pager{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--ink3)}.pager span:last-child{display:flex;gap:14px;align-items:center}.pager b{color:var(--ink2);font-weight:500}.pager a{text-decoration:none}
.empty{padding:28px;text-align:center;color:var(--ink3);border:1px dashed var(--line);border-radius:12px}
.note{margin:14px 0 0;font-size:12px;color:var(--ink3);max-width:110ch}.note b{color:var(--ink2);font-weight:600}
.foot{font-size:12px;color:var(--ink3);text-align:center}
.gate{min-height:100vh;display:grid;place-content:center;grid-template-columns:min(440px,100%);padding:16px;background:radial-gradient(60% 50% at 50% 0%,rgba(37,99,235,.18),transparent)}
.gate-card{display:grid;gap:12px;justify-items:start;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:28px}
.gate-card h1{font-size:24px}.gate-card p{margin:0;color:var(--ink2)}.gate-card .muted{color:var(--ink3);font-size:13px}.gate-card .button{margin-top:8px}
.id{display:block;width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:10px;font-size:13px;word-break:break-all;user-select:all}
@media (max-width:1100px){.ribbon{grid-template-columns:1fr 1fr}.stat:nth-child(3){border-left:0}.stat:nth-child(n+3){border-top:1px solid var(--line)}}
@media (max-width:860px){.admin{grid-template-columns:1fr}.side{position:static;height:auto;flex-direction:row;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 16px;border-right:0;border-bottom:1px solid var(--line)}
.brand em{margin-left:8px}.side nav{flex-direction:row;margin-left:auto}.group,.side-foot{display:none}main{padding:20px 16px 40px}.head h1{font-size:24px}}
@media (max-width:520px){.ribbon{grid-template-columns:1fr}.stat{border-left:0;border-top:1px solid var(--line)}.stat:first-child{border-top:0}.search{width:100%}.search input[type=search]{flex:1;width:auto}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
