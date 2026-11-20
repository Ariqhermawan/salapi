// Server-rendered, script-free HTML for the admin host (admin.salapi.app). Pure:
// data in, document out. Links are relative to that host's "/"; appUrl is the main app.
import { html, SafeHtml } from "./admin-html.ts";
import { ADMIN_PAGE_SIZE, DEFAULT_SEGMENT, SEGMENT_FILTERS, SEGMENT_LABEL, SORTS, accountSegment, activationFunnel, dailySignups, providerLabel, inPeriod, monthlySignups, wibDay, type AdminAccountRow, type AdminAuthUser, type AdminQuery, type AdminSegmentFilter, type AdminSort, type DailySignups, type SnapshotState } from "./admin-users.ts";

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
  return renderShell(data, "", html`
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
    ${renderMonths(months, days)}
    ${renderActivation(data)}
    ${renderUsers(data)}
    <footer class="foot">Salapi Admin · Waktu dalam WIB · Data akun dari Supabase, username dan transaksi dari Stellar Testnet</footer>`);
}

export interface AdminViewer { viewerId: string; viewerEmail: string | null; appUrl: string }

/** Sidebar + main column shared by the overview and the account detail page. `base` prefixes the section anchors ("/" off the overview). */
export function renderShell(viewer: AdminViewer, base: "" | "/", main: SafeHtml): SafeHtml {
  return html`<div class="shell">
  <aside class="side">
    <a class="brand" href="${base}#overview"><img src="/icon.svg" alt="" width="30" height="30"><span>Salapi <b>Admin</b></span><em>Testnet</em></a>
    <nav aria-label="Menu admin"><p class="group">Pantau</p><a href="${base}#overview">Ringkasan</a><a href="${base}#users">Pengguna</a></nav>
    <div class="side-foot"><span>Admin</span><strong class="viewer">${viewer.viewerEmail ?? "Tanpa email"}</strong><code title="${viewer.viewerId}">${viewer.viewerId.slice(0, 8)}</code><a href="${viewer.appUrl}" target="_blank" rel="noopener noreferrer">Buka Salapi ↗</a></div>
  </aside>
  <main>${main}</main>
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

/** Signups, with "this month" up front: a hero card, monthly columns, the last 30 days, and a foldable table. */
function renderMonths(months: readonly { month: string; total: number; real: number }[], days: readonly DailySignups[]): SafeHtml {
  if (!months.length) return html`<section class="panel" aria-labelledby="months-title"><div class="panel-title"><div><span class="eyebrow">AKUISISI</span><h2 id="months-title">Pendaftaran</h2></div></div><p class="muted">Belum ada pendaftaran.</p></section>`;
  const max = Math.max(1, ...months.map(month => month.total));
  const current = months[months.length - 1], previous = months.length > 1 ? months[months.length - 2] : null;
  const diff = previous ? current.real - previous.real : 0;
  const delta = !previous ? html`<span class="delta flat">Bulan pertama</span>`
    : diff > 0 ? html`<span class="delta up">▲ ${number(diff)} dari ${monthLabel(previous.month)}</span>`
    : diff < 0 ? html`<span class="delta down">▼ ${number(-diff)} dari ${monthLabel(previous.month)}</span>`
    : html`<span class="delta flat">Sama seperti ${monthLabel(previous.month)}</span>`;
  const share = current.total ? Math.round(current.real / current.total * 100) : 0;
  return html`<section class="panel acq" aria-labelledby="months-title">
    <div class="panel-title"><div><span class="eyebrow">AKUISISI</span><h2 id="months-title">Pendaftaran</h2></div>
      <div class="legend"><span class="key blue"></span>Asli<span class="key muted"></span>Tim &amp; tes</div></div>
    <div class="acq-grid">
      <a class="acq-hero" href="${view({ segment: "real", month: current.month })}">
        <span class="eyebrow">Bulan ini · ${monthLabel(current.month)}</span>
        <strong>${number(current.real)}</strong>
        <span class="acq-sub">pengguna asli baru</span>
        ${delta}
        <span class="share" aria-hidden="true"><i style="width:${share}%"></i></span>
        <small>${number(current.real)} asli dari ${number(current.total)} pendaftaran (${share}%)</small>
        <span class="acq-cta">Lihat akunnya <span aria-hidden="true">→</span></span>
      </a>
      <div class="acq-chart" role="list" aria-label="Pendaftaran per bulan">
        ${months.map(month => html`<a class="mcol${month.month === current.month ? " now" : ""}" role="listitem" href="${view({ segment: "all", month: month.month })}" aria-label="${monthLabel(month.month)}: ${number(month.total)} pendaftaran, ${number(month.real)} asli">
          <span class="mbars" aria-hidden="true"><i class="real" style="height:${(month.real / max * 100).toFixed(2)}%" data-v="${number(month.real)}"></i><i class="other" style="height:${((month.total - month.real) / max * 100).toFixed(2)}%" data-v="${number(month.total - month.real)}"></i></span>
          <span class="mlabel" aria-hidden="true">${monthLabel(month.month)}</span>
          <span class="mtotal" aria-hidden="true">${number(month.total)} total</span>
        </a>`)}
      </div>
    </div>
    ${renderDaily(days)}
    <details class="acq-table"><summary>Rincian per bulan</summary>
      <table class="mini"><thead><tr><th>Bulan</th><th>Total daftar</th><th>Asli</th><th>Tim &amp; tes</th></tr></thead><tbody>
        ${[...months].reverse().map(month => html`<tr><td><a href="${view({ segment: "all", month: month.month })}">${monthLabel(month.month)}</a></td><td><a href="${view({ segment: "all", month: month.month })}">${number(month.total)}</a></td><td><a href="${view({ segment: "real", month: month.month })}">${number(month.real)}</a></td><td>${number(month.total - month.real)}</td></tr>`)}
      </tbody></table>
    </details>
  </section>`;
}

/**
 * Real accounts from sign-up to repeat use, folded by default (native
 * <details>, no script): the summary line carries the headline numbers.
 */
function renderActivation(data: AdminPanelData): SafeHtml {
  const { snapshot } = data;
  const funnel = activationFunnel(data.users.filter(user => accountSegment(user) === "real"), snapshot ?? null, data.now);
  const base = Math.max(1, funnel.registered);
  const pct = (value: number, of = base) => `${Math.round(value / Math.max(1, of) * 100)}%`;
  const status = snapshot === undefined ? "Snapshot gagal dimuat" : snapshot === null ? "Belum ada snapshot"
    : `Snapshot ${DAY.format(new Date(snapshot.capturedAt))}, ${TIME.format(new Date(snapshot.capturedAt))} WIB`;
  const steps: { label: string; hint: string; value: number | null }[] = [
    { label: "Terdaftar", hint: "Akun asli", value: funnel.registered },
    { label: "Punya username", hint: "Sudah klaim @username", value: snapshot ? funnel.username : null },
    { label: "Pernah bertransaksi", hint: "≥1 transaksi selain klaim username", value: snapshot ? funnel.transacted : null },
    { label: "Rutin", hint: "≥3 transaksi selain klaim username", value: snapshot ? funnel.regular : null },
  ];
  return html`<details class="panel fold" id="activation">
    <summary>
      <div><span class="eyebrow">AKTIVASI · PENGGUNA ASLI</span><h2 id="funnel-title">Dari daftar ke transaksi</h2></div>
      <div class="fold-kpis">${snapshot
        ? html`<span><b>${pct(funnel.transacted)}</b> pernah bertransaksi</span><span><b>${number(funnel.regular)}</b> rutin</span>`
        : html`<span>${status}</span>`}</div>
      <span class="chev" aria-hidden="true"></span>
    </summary>
    <div class="fold-body">
      <div class="fold-meta"><span class="tag">${status}</span></div>
      <ol class="fsteps">${steps.map((step, i) => {
        const before = i ? steps[i - 1].value : null;
        return html`<li class="fstep">
          <span class="eyebrow">Langkah ${i + 1}</span>
          <b>${step.value === null ? "Belum ada" : number(step.value)}</b>
          <span class="fname">${step.label}</span><small>${step.hint}</small>
          <span class="fbar" aria-hidden="true"><i style="width:${step.value === null ? 0 : (step.value / base * 100).toFixed(1)}%"></i></span>
          <span class="fpct">${step.value === null ? "" : html`${pct(step.value)} dari terdaftar${i && before ? html` · <em>${pct(step.value, before)} dari langkah sebelumnya</em>` : ""}`}</span>
        </li>`;
      })}</ol>
      <div class="active-grid">
        <div><strong>${number(funnel.signedIn7)}</strong><span>Masuk 7 hari terakhir</span></div>
        <div><strong>${number(funnel.signedIn30)}</strong><span>Masuk 30 hari terakhir</span></div>
        <div><strong>${funnel.transacting7 === null ? "Belum ada" : number(funnel.transacting7)}</strong><span>${funnel.transacting7 === null ? "Bertransaksi 7 hari (butuh 7 hari riwayat snapshot)" : "Bertransaksi 7 hari terakhir"}</span></div>
      </div>
      ${snapshot && funnel.covered < funnel.registered ? html`<p class="note">${number(funnel.registered - funnel.covered)} akun asli belum ada di snapshot (daftar setelahnya atau gagal dibaca) dan akan ikut di snapshot berikutnya.</p>` : ""}
      <p class="note">Langkah on-chain diambil dari snapshot harian pukul 00.15 WIB. Klaim username juga dihitung satu transaksi, jadi "bertransaksi" hanya menghitung transaksi di luar itu. Angka ini perkiraan karena percobaan yang gagal di ledger ikut terhitung. Data masuk diambil langsung dari Supabase Auth.</p>
    </div>
  </details>`;
}

/** The last 30 WIB days: stacked bars, a dot for quiet days, the busiest day called out. */
function renderDaily(days: readonly DailySignups[]): SafeHtml {
  if (!days.length) return html``;
  const max = Math.max(1, ...days.map(day => day.total));
  const total = days.reduce((sum, day) => sum + day.total, 0), real = days.reduce((sum, day) => sum + day.real, 0);
  const busiest = days.reduce((top, day) => (day.total > top.total ? day : top), days[0]);
  const label = (day: string) => DAY_SHORT.format(new Date(`${day}T00:00:00Z`));
  return html`<div class="daily">
    <div class="daily-head"><span class="eyebrow">30 hari terakhir</span>
      <span class="chips"><span class="chip-stat"><b>${number(total)}</b> daftar</span><span class="chip-stat real"><b>${number(real)}</b> asli</span>${busiest.total ? html`<span class="chip-stat">Tersibuk <b>${label(busiest.day)}</b> (${number(busiest.total)})</span>` : ""}</span></div>
    <div class="day-bars" role="img" aria-label="Pendaftaran harian 30 hari terakhir: ${number(total)} daftar, ${number(real)} asli">
      ${days.map((day, i) => html`<span class="day${day.total ? "" : " quiet"}${i === days.length - 1 ? " today" : ""}" title="${label(day.day)}: ${number(day.total)} daftar, ${number(day.real)} asli"><i class="day-other" style="height:${((day.total - day.real) / max * 100).toFixed(2)}%"></i><i class="day-real" style="height:${(day.real / max * 100).toFixed(2)}%"></i></span>`)}
    </div>
    <div class="day-axis" aria-hidden="true"><span>${label(days[0].day)}</span><span>${label(days[Math.floor(days.length / 2)].day)}</span><span>Hari ini</span></div></div>`;
}

function renderUsers(data: AdminPanelData): SafeHtml {
  const { query, page, pages, matches } = data;
  // Tab counts follow the period filters, so each tab says what clicking it shows.
  const scoped = inPeriod(data.users, query);
  const months = monthlySignups(data.users, data.now).map(month => month.month).reverse();
  const today = wibDay(data.now.toISOString());
  const filtered = Boolean(query.month || query.from || query.to);
  const dayLabel = (day: string) => DAY.format(new Date(`${day}T12:00:00+07:00`));
  const range = query.from && query.to ? `${dayLabel(query.from)} sampai ${dayLabel(query.to)}` : query.from ? `sejak ${dayLabel(query.from)}` : query.to ? `sampai ${dayLabel(query.to)}` : "";
  const segments = new Map<AdminSegmentFilter, number>(SEGMENT_FILTERS.map(segment => [segment, 0]));
  for (const user of scoped) segments.set(accountSegment(user), (segments.get(accountSegment(user)) ?? 0) + 1);
  segments.set("all", scoped.length);
  const first = matches ? (page - 1) * ADMIN_PAGE_SIZE + 1 : 0;
  return html`<section class="panel" id="users" aria-labelledby="users-title" tabindex="-1">
    <div class="panel-title"><div><span class="eyebrow">DIREKTORI AKUN</span><h2 id="users-title">Pengguna</h2></div>
      <div class="title-actions"><span class="tag">${number(matches)} akun</span><a class="button ghost small" href="${adminExportHref(query)}" download>⬇ Export akun asli (Excel${filtered ? ", sesuai filter" : ""})</a></div></div>
    <div class="tools">
      <nav class="tabs" aria-label="Segmen akun">${SEGMENT_FILTERS.map(segment => html`<a href="${adminHref({ ...query, segment }, 1)}"${segment === query.segment ? html` aria-current="page"` : ""}>${SEGMENT_LABEL[segment]} <span>${number(segments.get(segment) ?? 0)}</span></a>`)}</nav>
    </div>
    <form class="filters" method="get" action="/#users" novalidate role="search" aria-label="Filter pengguna">
      <input type="hidden" name="segment" value="${query.segment}">${query.sort !== "daftar" ? html`<input type="hidden" name="sort" value="${query.sort}">` : ""}
      <label class="field grow"><span>Cari</span><input type="search" name="q" value="${query.q}" maxlength="100" placeholder="Email atau User ID" autocomplete="off"></label>
      <label class="field"><span>Bulan daftar</span><select name="month"><option value="">Semua bulan</option>${months.map(month => html`<option value="${month}"${month === query.month ? html` selected` : ""}>${monthLabel(month)}${month === months[0] ? " · bulan ini" : ""}</option>`)}</select></label>
      <label class="field"><span>Dari tanggal</span><input type="date" name="from" value="${query.from ?? ""}" max="${today}"></label>
      <label class="field"><span>Sampai tanggal</span><input type="date" name="to" value="${query.to ?? ""}" max="${today}"></label>
      <div class="filter-actions"><button class="button" type="submit">Terapkan</button>${filtered || query.q ? html`<a class="clear" href="${adminHref({ ...query, q: "", month: "", from: "", to: "" }, 1)}">Reset</a>` : ""}</div>
    </form>
    ${filtered || query.q ? html`<div class="active-filters" aria-label="Filter aktif">
      ${query.month ? html`<a class="chip" href="${adminHref({ ...query, month: "" }, 1)}" aria-label="Hapus filter bulan ${monthLabel(query.month)}">Bulan ${monthLabel(query.month)} <span aria-hidden="true">✕</span></a>` : ""}
      ${range ? html`<a class="chip" href="${adminHref({ ...query, from: "", to: "" }, 1)}" aria-label="Hapus filter tanggal">Daftar ${range} <span aria-hidden="true">✕</span></a>` : ""}
      ${query.q ? html`<a class="chip" href="${adminHref({ ...query, q: "" }, 1)}" aria-label="Hapus pencarian">Cari "${query.q}" <span aria-hidden="true">✕</span></a>` : ""}
    </div>` : ""}
    <nav class="sorts" aria-label="Urutan"><span class="muted">Urutkan</span>${SORTS.filter(sort => sort !== "tx" || data.snapshot).map(sort => html`<a href="${adminHref({ ...query, sort }, 1)}"${sort === query.sort ? html` aria-current="page"` : ""}>${SORT_LABEL[sort]}</a>`)}</nav>
    ${data.rows.length ? html`<div class="table-wrap"><table class="users">
      <thead><tr><th>Daftar</th><th>Akun</th><th>Username</th><th>Wallet</th><th class="num">Tx terkirim</th></tr></thead>
      <tbody>${data.rows.map(row => renderRow(row, data.adminIds))}</tbody></table></div>
      <div class="pager"><span>Menampilkan ${number(first)} sampai ${number(first + data.rows.length - 1)} dari ${number(matches)}</span>
        <span>${page > 1 ? html`<a href="${adminHref(query, page - 1)}">← Sebelumnya</a>` : ""}<b>Halaman ${number(page)} dari ${number(pages)}</b>${page < pages ? html`<a href="${adminHref(query, page + 1)}">Berikutnya →</a>` : ""}</span></div>`
      : html`<p class="empty">Tidak ada akun yang cocok.</p>`}
    <p class="note"><b>Tx terkirim</b> dihitung dari sequence number wallet di Stellar Testnet: jumlah transaksi yang dikirim dari wallet itu, termasuk yang gagal di ledger, tanpa dana masuk. Riwayat lengkap ada di tautan Stellar Expert. <b>Export akun asli (Excel)</b> berisi semua akun asli yang cocok dengan filter bulan dan tanggal (bukan hanya halaman ini), dengan kolom terpisah dan sheet Ringkasan berisi total tx. Filter tanggal memakai hari WIB, termasuk tanggal awal dan akhir. <b>Asli</b> berarti di luar akun tim (admin dan akun internal), simulasi, load test, dan akun QA (.invalid atau .test).</p>
  </section>`;
}

function renderRow({ user, wallet, username, sentTx }: AdminAccountRow, adminIds: ReadonlySet<string>): SafeHtml {
  const segment = accountSegment(user);
  const provider = providerLabel(user);
  const failed = html`<span class="warn">Gagal dimuat</span>`;
  return html`<tr>
    <td data-label="Daftar">${valid(user.created_at) ? html`<span class="strong">${DAY.format(new Date(user.created_at))}</span><small>${TIME.format(new Date(user.created_at))} WIB</small>` : "Tidak diketahui"}
      <small>${valid(user.last_sign_in_at) ? html`Masuk terakhir ${DAY.format(new Date(user.last_sign_in_at))}` : "Belum pernah masuk"}</small></td>
    <td data-label="Akun"><a class="strong email" href="/?user=${user.id}">${user.email || "Tanpa email"}</a>
      <small><span class="pill ${segment}">${SEGMENT_LABEL[segment]}</span>${adminIds.has(user.id.toLowerCase()) ? html`<span class="pill admin">Admin</span>` : ""}${provider} · <code title="${user.id}">${user.id.slice(0, 8)}</code></small></td>
    <td data-label="Username">${username.status === "ok" ? html`<span class="handle">@${username.value}</span>` : username.status === "none" ? html`<span class="muted">Belum dibuat</span>` : failed}</td>
    <td data-label="Wallet">${wallet.status === "ok" ? html`<a class="addr" href="https://stellar.expert/explorer/testnet/account/${wallet.value}" target="_blank" rel="noopener noreferrer">${wallet.value}</a>` : wallet.status === "none" ? html`<span class="muted">Belum dibuat</span>` : failed}</td>
    <td class="num" data-label="Tx terkirim">${sentTx.status === "ok" ? html`<span class="count">${number(sentTx.value)}</span>` : sentTx.status === "none" ? html`<span class="muted">Belum aktif</span>` : failed}</td>
  </tr>`;
}

/** Excel export of real accounts within the active month/date filters (search and segment don't apply). */
export function adminExportHref(query: AdminQuery): string {
  const params = new URLSearchParams({ format: "xlsx" });
  if (query.month) params.set("month", query.month);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  return `/?${params}`;
}

/** Admin-host link that keeps the active filters. */
export function adminHref(query: AdminQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.segment !== DEFAULT_SEGMENT) params.set("segment", query.segment);
  if (query.month) params.set("month", query.month);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
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
.shell{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh}
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
table{width:100%;border-collapse:collapse}th{text-align:left;font:500 11px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}tbody tr:hover td{background:rgba(122,162,255,.05)}
.mini{margin-top:14px;font-variant-numeric:tabular-nums}.mini th{white-space:normal}.mini td{padding:8px 12px;color:var(--ink2)}.mini td:first-child{color:var(--ink)}.mini td a{color:inherit;text-decoration:none}.mini td a:hover{color:var(--blue);text-decoration:underline}.mini tbody tr:hover td{background:rgba(122,162,255,.05)}
.tools{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.tabs{display:flex;gap:4px;flex-wrap:wrap;background:var(--bg);padding:4px;border-radius:12px;border:1px solid var(--line)}
.tabs a{padding:6px 11px;border-radius:9px;color:var(--ink2);text-decoration:none;font-weight:500;font-size:13px}.tabs a span{font:500 11px var(--mono);color:var(--ink3);margin-left:4px}
.tabs a:hover{color:var(--ink)}.tabs a[aria-current]{background:var(--panel2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.chip{display:inline-flex;align-items:center;gap:8px;align-self:center;padding:6px 10px;border-radius:999px;background:rgba(37,99,235,.18);color:#cfdcff;text-decoration:none;font-size:13px;font-weight:500}.chip:hover{background:rgba(37,99,235,.3)}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}.users{min-width:880px}
.users td small{display:block;color:var(--ink3);font-size:12px;margin-top:2px}.strong{font-weight:600}a.email{color:var(--ink);text-decoration:none;border-bottom:1px solid transparent}a.email:hover{color:var(--blue);border-bottom-color:currentColor}
.back{display:inline-block;margin-bottom:8px;font-size:13px;text-decoration:none}.detail-email{word-break:break-all}.facts .stat strong{font-size:22px}.facts .stat:first-child strong{font-size:26px}
.detail-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}.detail-grid .panel{margin:0}.list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.list li{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}.list li:last-child{border-bottom:0}.list small{color:var(--ink3)}
.dir-sent{color:var(--amber)}.dir-received{color:var(--green)}@media (max-width:1100px){.detail-grid{grid-template-columns:1fr}}.email{word-break:break-all}
.users code{font-size:11px;color:var(--ink3)}.handle{font-weight:600;color:var(--blue)}
.addr{font:12px/1.45 var(--mono);color:var(--ink2);word-break:break-all;display:inline-block;max-width:30ch;text-decoration:none;border-bottom:1px dashed rgba(122,162,255,.35)}.addr:hover{color:var(--blue)}
.num{text-align:right}.count{font:500 18px var(--mono);font-variant-numeric:tabular-nums}
.pill{display:inline-block;font:500 10px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;padding:4px 6px;border-radius:6px;margin-right:6px;background:var(--panel2);color:var(--ink2)}
.pill.real{background:rgba(52,211,153,.14);color:var(--green)}.pill.simulation{background:rgba(185,166,255,.14);color:var(--violet)}.pill.load_test{background:rgba(245,180,84,.14);color:var(--amber)}.pill.admin{background:rgba(37,99,235,.25);color:#cfdcff}.pill.team{background:rgba(52,211,153,.08);color:#9fe7c9;box-shadow:inset 0 0 0 1px rgba(52,211,153,.3)}
.active-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.active-grid div{display:grid;gap:4px;padding:12px 14px;background:var(--bg);border:1px solid var(--line);border-radius:12px}
.active-grid strong{font:500 22px var(--mono)}.active-grid span{font-size:12px;color:var(--ink3)}@media (max-width:640px){.active-grid{grid-template-columns:1fr}}
.filters{display:grid;grid-template-columns:minmax(200px,1.5fr) repeat(3,minmax(150px,1fr)) auto;gap:10px;align-items:end;margin:0 0 12px;padding:14px;border-radius:14px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line)}
.field{display:grid;gap:6px;min-width:0}.field span{font:500 10px var(--mono);letter-spacing:.1em;text-transform:uppercase;color:var(--ink3)}
.field input,.field select{width:100%;min-width:0;background:var(--panel);border:1px solid var(--line);color:var(--ink);border-radius:10px;padding:9px 12px;font:inherit;color-scheme:dark}.field input::placeholder{color:var(--ink3)}.field input:focus,.field select:focus{outline:2px solid var(--blue);outline-offset:1px}
.filter-actions{display:flex;align-items:center;gap:10px}.active-filters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
@media (max-width:1000px){.filters{grid-template-columns:1fr 1fr}.field.grow{grid-column:1/-1}}@media (max-width:520px){.filters{grid-template-columns:1fr}}
.sorts{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:-4px 0 12px;font-size:12px}.sorts .muted{margin-right:6px}.sorts a{padding:4px 9px;border-radius:999px;color:var(--ink2);text-decoration:none}.sorts a:hover{color:var(--ink)}.sorts a[aria-current]{background:var(--panel2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.pager{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--ink3)}.pager span:last-child{display:flex;gap:14px;align-items:center}.pager b{color:var(--ink2);font-weight:500}.pager a{text-decoration:none}
.empty{padding:28px;text-align:center;color:var(--ink3);border:1px dashed var(--line);border-radius:12px}
.note{margin:14px 0 0;font-size:12px;color:var(--ink3);max-width:110ch}.note b{color:var(--ink2);font-weight:600}
.foot{font-size:12px;color:var(--ink3);text-align:center}
.gate{min-height:100vh;display:grid;place-content:center;grid-template-columns:min(440px,100%);padding:16px;background:radial-gradient(60% 50% at 50% 0%,rgba(37,99,235,.18),transparent)}
.gate-card{display:grid;gap:12px;justify-items:start;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:28px}
.gate-card h1{font-size:24px}.gate-actions{display:flex;flex-wrap:wrap;gap:8px}.gate-card p{margin:0;color:var(--ink2)}.gate-card .muted{color:var(--ink3);font-size:13px}.gate-card .button{margin-top:8px}
.id{display:block;width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:10px;font-size:13px;word-break:break-all;user-select:all}
.acq-grid{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:18px;align-items:stretch}
.acq-hero{position:relative;display:flex;flex-direction:column;gap:6px;padding:20px;border-radius:16px;text-decoration:none;color:var(--ink);overflow:hidden;background:radial-gradient(120% 90% at 0% 0%,rgba(37,99,235,.35),transparent 60%),linear-gradient(160deg,#16244a,#0f1a33);box-shadow:inset 0 0 0 1px rgba(122,162,255,.22);transition:transform .15s,box-shadow .15s}
.acq-hero:hover{transform:translateY(-2px);box-shadow:inset 0 0 0 1px rgba(122,162,255,.5),0 12px 30px rgba(5,10,25,.45)}
.acq-hero strong{font:600 64px/1 var(--mono);letter-spacing:-.04em;margin-top:6px;color:#e4ecff}.acq-sub{color:var(--ink2);font-size:13px}
.delta{align-self:flex-start;margin-top:4px;padding:3px 9px;border-radius:999px;font:500 12px var(--mono)}.delta.up{background:rgba(52,211,153,.14);color:var(--green)}.delta.down{background:rgba(245,180,84,.14);color:var(--amber)}.delta.flat{background:var(--panel2);color:var(--ink2)}
.share{display:block;height:6px;margin-top:auto;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden}.share i{display:block;height:100%;background:linear-gradient(90deg,#5b8cff,var(--green));border-radius:999px}
.acq-hero small{color:var(--ink3);font-size:12px}.acq-cta{font-size:13px;font-weight:600;color:var(--blue)}.acq-hero:hover .acq-cta span{display:inline-block;transform:translateX(3px)}
.acq-chart{display:flex;align-items:stretch;gap:16px;min-height:250px;padding:14px 12px 10px;border-radius:16px;background:repeating-linear-gradient(to top,rgba(150,172,214,.07) 0 1px,transparent 1px 25%) 0 14px/100% calc(100% - 64px) no-repeat,var(--bg);box-shadow:inset 0 0 0 1px var(--line);overflow-x:auto}
.mcol{flex:0 0 108px;display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 4px;border-radius:12px;text-decoration:none;color:inherit;transition:background .15s}
.mcol:hover{background:rgba(122,162,255,.08)}.mcol.now{background:rgba(37,99,235,.1);box-shadow:inset 0 0 0 1px rgba(122,162,255,.25)}
.mcol:first-child{margin-left:auto}.mcol:last-child{margin-right:auto}
.mbars{flex:1;display:flex;align-items:flex-end;justify-content:center;gap:6px;padding-top:22px}
.mbars i{position:relative;display:block;width:28px;min-height:3px;border-radius:7px 7px 3px 3px}.mbars i::before{content:attr(data-v);position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:5px;font:600 13px var(--mono);white-space:nowrap}
.mbars .real{background:linear-gradient(180deg,#7aa2ff,var(--action));box-shadow:0 0 18px rgba(37,99,235,.35)}.mbars .real::before{color:#cfdcff}.mbars .other{background:linear-gradient(180deg,#56658a,#33405f)}.mbars .other::before{color:var(--ink2)}
.mlabel{font:500 11px var(--mono);color:var(--ink2);white-space:nowrap}.mtotal{font-size:11px;color:var(--ink3)}.mcol.now .mlabel{color:var(--ink)}
.daily{margin-top:18px;padding:16px;border-radius:16px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line)}.daily-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip-stat{padding:4px 10px;border-radius:999px;background:var(--panel2);color:var(--ink2);font-size:12px}.chip-stat b{color:var(--ink);font-weight:600}.chip-stat.real b{color:var(--blue)}
.day-bars{display:flex;align-items:flex-end;gap:4px;height:84px;padding-bottom:2px;background:repeating-linear-gradient(to top,rgba(150,172,214,.07) 0 1px,transparent 1px 33.3%)}
.day{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;border-radius:4px;transition:background .15s}.day:hover{background:rgba(122,162,255,.12)}
.day-real,.day-other{display:block;width:100%}.day-real{background:linear-gradient(180deg,#7aa2ff,var(--action));border-radius:0 0 3px 3px}.day-other{background:#3e4c6e;border-radius:3px 3px 0 0}.day-real:first-child,.day-other:last-child{border-radius:3px}
.day.quiet::after{content:"";display:block;width:4px;height:4px;margin:0 auto;border-radius:50%;background:rgba(150,172,214,.25)}.day.today{box-shadow:inset 0 -2px 0 var(--green)}
.day-axis{display:flex;justify-content:space-between;margin-top:8px;font:500 11px var(--mono);color:var(--ink3)}
.acq-table{margin-top:14px}.acq-table summary,.fold summary{cursor:pointer;list-style:none}.acq-table summary::-webkit-details-marker,.fold summary::-webkit-details-marker{display:none}
.acq-table summary{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--ink2)}.acq-table summary::before{content:"▸";transition:transform .15s}.acq-table[open] summary::before{transform:rotate(90deg)}.acq-table summary:hover{color:var(--ink)}
.fold{padding:0}.fold summary{display:flex;align-items:center;gap:16px;padding:20px;border-radius:18px;transition:background .15s}.fold summary:hover{background:rgba(122,162,255,.05)}.fold summary>div:first-child{flex:1}.fold summary h2{font-size:18px;margin-top:6px;font-weight:600}
.fold-kpis{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.fold-kpis span{padding:5px 11px;border-radius:999px;background:var(--panel2);color:var(--ink2);font-size:12px}.fold-kpis b{color:var(--ink);font:600 13px var(--mono)}
.chev{width:30px;height:30px;flex:none;border-radius:50%;box-shadow:inset 0 0 0 1px var(--line);position:relative;transition:transform .2s}.chev::before{content:"";position:absolute;left:11px;top:9px;width:7px;height:7px;border-right:2px solid var(--ink2);border-bottom:2px solid var(--ink2);transform:rotate(45deg)}.fold[open] .chev{transform:rotate(180deg)}
.fold-body{padding:0 20px 20px}.fold-meta{margin-bottom:14px}
.fsteps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.fstep{position:relative;display:flex;flex-direction:column;gap:4px;padding:16px;border-radius:14px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line)}
.fstep:not(:last-child)::after{content:"→";position:absolute;right:-12px;top:50%;transform:translate(50%,-50%);z-index:1;width:22px;height:22px;display:grid;place-items:center;border-radius:50%;background:var(--panel2);color:var(--ink2);font-size:12px;box-shadow:0 0 0 3px var(--panel)}
.fstep b{font:600 30px/1.1 var(--mono);color:#e4ecff}.fname{font-weight:600}.fstep small{color:var(--ink3);font-size:12px;min-height:32px}
.fbar{display:block;height:6px;margin-top:4px;background:rgba(255,255,255,.06);border-radius:999px;overflow:hidden}.fbar i{display:block;height:100%;background:linear-gradient(90deg,var(--action),#7aa2ff);border-radius:999px}
.fpct{font:500 11px var(--mono);color:var(--ink3)}.fpct em{font-style:normal;color:var(--green)}
@media (max-width:1100px){.fsteps{grid-template-columns:repeat(2,minmax(0,1fr))}.fstep:nth-child(2)::after{display:none}}
@media (max-width:760px){.acq-grid{grid-template-columns:1fr}.acq-hero strong{font-size:52px}.fold summary{flex-wrap:wrap}.fold-kpis{justify-content:flex-start;order:3;width:100%}}
@media (max-width:520px){.acq-chart{gap:10px}.mcol{flex-basis:84px}.mbars{gap:4px}.mbars i{width:22px}}
@media (max-width:520px){.fsteps{grid-template-columns:1fr}.fstep::after{display:none}}
@media (max-width:1100px){.ribbon{grid-template-columns:1fr 1fr}.stat:nth-child(3){border-left:0}.stat:nth-child(n+3){border-top:1px solid var(--line)}}
@media (max-width:860px){.shell{grid-template-columns:1fr}.side{position:static;height:auto;flex-direction:row;align-items:center;flex-wrap:wrap;gap:12px;padding:14px 16px;border-right:0;border-bottom:1px solid var(--line)}
.brand em{margin-left:8px}.side nav{flex-direction:row;margin-left:auto}.group,.side-foot{display:none}main{padding:20px 16px 40px}.head h1{font-size:24px}}
@media (max-width:520px){.ribbon{grid-template-columns:1fr}.stat{border-left:0;border-top:1px solid var(--line)}.stat:first-child{border-top:0}.search{width:100%}.search input[type=search]{flex:1;width:auto}}
@media (max-width:640px){.table-wrap{border:0;overflow:visible}.users{min-width:0}.users thead{display:none}.users,.users tbody,.users tr,.users td{display:block;width:100%}
.users tr{border:1px solid var(--line);border-radius:12px;padding:6px 0;margin-bottom:10px;background:var(--panel2)}.users td{border:0;padding:6px 14px}.users td::before{content:attr(data-label);display:block;font:500 10px/1.6 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.users td.num{text-align:left}.addr{max-width:none}tbody tr:hover td{background:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;
