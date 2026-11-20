// Account detail page on the admin host (/?user=<id>). Pure: data in, HTML out.
import { html, type SafeHtml } from "./admin-html.ts";
import { SEGMENT_LABEL, accountSegment, providerLabel, type AdminAccountRow, type Lookup } from "./admin-users.ts";
import { renderShell, type AdminViewer } from "./admin-view.ts";
import { formatStroops } from "./format-stroops.ts";
import type { WalletActivityItem } from "./wallet-activity.ts";

export interface AdminDonations {
  count: number;
  totalStroops: string;
  recent: { campaignId: string; amountStroops: string; createdAt: string; anonymous: boolean; hash: string }[];
}
export interface AdminUserDetail {
  row: AdminAccountRow;
  balances: Lookup<{ asset: "XLM" | "USDC"; amount: string }[]>;
  activity: Lookup<WalletActivityItem[]>;
  donations: Lookup<AdminDonations>;
  campaigns: Lookup<{ campaignId: string; title: string; createdAt: string; archived: boolean }[]>;
  arisanRooms: Lookup<string[]>;
  history: Lookup<{ day: string; txSent: number }[]>;
}
export interface AdminDetailPage extends AdminViewer {
  detail: AdminUserDetail;
  isAdmin: boolean;
  /** Wallet → username from the latest snapshot, to name Salapi counterparties. */
  handles: ReadonlyMap<string, string>;
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", ...options });
const DAY = fmt({ day: "numeric", month: "short", year: "numeric" });
const STAMP = fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const DAY_SHORT = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" });
const number = (value: number) => value.toLocaleString("id-ID");
const date = (iso: string | null | undefined, format = DAY) => (Number.isFinite(Date.parse(iso ?? "")) ? format.format(new Date(iso as string)) : "Tidak diketahui");
const amount = (decimal: string) => decimal.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
const failed = html`<span class="warn">Gagal dimuat</span>`;
const CONTEXT_LABEL: Record<string, string> = {
  "campaign-donation": "Donasi kampanye", "campaign-refund": "Refund kampanye", "campaign-payout": "Pencairan kampanye",
  "arisan-funding": "Setoran arisan", "arisan-win": "Menang arisan", "arisan-refund": "Refund arisan",
  "paluwagan-funding": "Setoran paluwagan", "paluwagan-payout": "Pencairan paluwagan",
  "disaster-contribution": "Donasi Disaster Vault", "disaster-payout": "Pencairan Disaster Vault",
  "savings-deposit": "Setoran tabungan", "savings-withdrawal": "Penarikan tabungan",
};

function show<T>(value: Lookup<T>, ok: (value: T) => SafeHtml | string, none: string): SafeHtml | string {
  return value.status === "ok" ? ok(value.value) : value.status === "none" ? html`<span class="muted">${none}</span>` : failed;
}

function fact(label: string, value: SafeHtml | string, sub: SafeHtml | string = ""): SafeHtml {
  return html`<div class="stat"><span class="eyebrow">${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
}

/** An invalid or unknown ?user= id. */
export function renderAdminUserMissing(viewer: AdminViewer): SafeHtml {
  return renderShell(viewer, "/", html`<header class="head"><div><a class="back" href="/#users">← Pengguna</a><h1>Akun tidak ditemukan</h1>
    <p>User ID ini tidak ada di Supabase Auth. Mungkin akunnya sudah dihapus.</p></div></header>`);
}

export function renderAdminUserDetail(page: AdminDetailPage): SafeHtml {
  const { row, balances, activity, donations, campaigns, arisanRooms, history } = page.detail;
  const { user } = row;
  const segment = accountSegment(user);
  const address = row.wallet.status === "ok" ? row.wallet.value : null;
  const who = (wallet: string | null) => {
    if (!wallet) return html`<span class="muted">Tidak ada</span>`;
    const handle = page.handles.get(wallet);
    return handle ? html`<span class="handle">@${handle}</span>` : html`<code>${wallet.slice(0, 6)}…${wallet.slice(-4)}</code>`;
  };
  return renderShell(page, "/", html`
    <header class="head"><div>
      <a class="back" href="/#users">← Pengguna</a>
      <h1 class="detail-email">${user.email || "Tanpa email"}</h1>
      <p><span class="pill ${segment}">${SEGMENT_LABEL[segment]}</span>${page.isAdmin ? html`<span class="pill admin">Admin</span>` : ""}${providerLabel(user)} · Daftar ${date(user.created_at, STAMP)} WIB · Masuk terakhir ${user.last_sign_in_at ? html`${date(user.last_sign_in_at, STAMP)} WIB` : "belum pernah"}</p>
      <p class="viewer-line">User ID <code>${user.id}</code></p>
    </div></header>
    <section class="ribbon facts" aria-label="Ringkasan akun">
      ${fact("Username", show(row.username, handle => html`<span class="handle">@${handle}</span>`, "Belum dibuat"))}
      ${fact("Saldo", show(balances, list => list.length ? list.map(item => `${amount(item.amount)} ${item.asset}`).join(" · ") : "0 XLM", "Tanpa wallet"), "Stellar Testnet")}
      ${fact("Tx terkirim", show(row.sentTx, count => number(count), "Belum aktif"), "Dari sequence number wallet")}
      ${fact("Donasi", show(donations, total => number(total.count), "Belum ada"), donations.status === "ok" ? `${formatStroops(donations.value.totalStroops)} XLM total` : "")}
    </section>
    <section class="panel" aria-labelledby="wallet-title">
      <div class="panel-title"><div><span class="eyebrow">WALLET CUSTODIAL</span><h2 id="wallet-title">Alamat wallet</h2></div>
        ${address ? html`<a class="button ghost small" href="https://stellar.expert/explorer/testnet/account/${address}" target="_blank" rel="noopener noreferrer">Stellar Expert ↗</a>` : ""}</div>
      ${show(row.wallet, wallet => html`<code class="id">${wallet}</code>`, "Belum dibuat")}
    </section>
    <section class="panel" aria-labelledby="activity-title">
      <div class="panel-title"><div><span class="eyebrow">ON-CHAIN</span><h2 id="activity-title">Aktivitas terbaru</h2></div><span class="tag">Maks. 15 terakhir</span></div>
      ${show(activity, items => items.length ? html`<div class="table-wrap"><table class="users activity">
        <thead><tr><th>Waktu (WIB)</th><th>Arah</th><th class="num">Jumlah</th><th>Keterangan</th><th>Lawan</th><th>Tx</th></tr></thead>
        <tbody>${items.map(item => html`<tr>
          <td data-label="Waktu (WIB)">${date(item.createdAt, STAMP)}</td>
          <td data-label="Arah"><span class="dir-${item.direction}">${item.direction === "sent" ? "Kirim" : "Terima"}</span></td>
          <td class="num" data-label="Jumlah">${formatStroops(item.amountStroops)} ${item.asset.code}</td>
          <td data-label="Keterangan">${item.context ? html`${CONTEXT_LABEL[item.context.type] ?? item.context.type}${item.context.title ? html`<small>${item.context.title}</small>` : ""}` : item.kind === "account-created" ? "Pembuatan akun" : "Transfer"}</td>
          <td data-label="Lawan">${who(item.counterparty)}</td>
          <td data-label="Tx"><a class="addr" href="https://stellar.expert/explorer/testnet/tx/${item.hash}" target="_blank" rel="noopener noreferrer">${item.hash.slice(0, 10)}…</a></td>
        </tr>`)}</tbody></table></div>` : html`<p class="empty">Belum ada pergerakan aset.</p>`, "Belum ada wallet")}
    </section>
    <div class="detail-grid">
      <section class="panel" aria-labelledby="campaigns-title"><div class="panel-title"><div><span class="eyebrow">KAMPANYE</span><h2 id="campaigns-title">Dibuat</h2></div></div>
        ${show(campaigns, list => list.length ? html`<ul class="list">${list.map(item => html`<li><span>${item.title}${item.archived ? html` <small>(diarsipkan)</small>` : ""}</span><small>${date(item.createdAt)}</small></li>`)}</ul>` : html`<p class="muted">Belum membuat kampanye.</p>`, "Belum ada wallet")}</section>
      <section class="panel" aria-labelledby="arisan-title"><div class="panel-title"><div><span class="eyebrow">ARISAN</span><h2 id="arisan-title">Room</h2></div></div>
        ${show(arisanRooms, rooms => rooms.length ? html`<ul class="list">${rooms.map(room => html`<li><span>${room}</span></li>`)}</ul>` : html`<p class="muted">Belum ikut arisan.</p>`, "Belum ada wallet")}</section>
      <section class="panel" aria-labelledby="donations-title"><div class="panel-title"><div><span class="eyebrow">DONASI</span><h2 id="donations-title">Terbaru</h2></div></div>
        ${show(donations, total => total.recent.length ? html`<ul class="list">${total.recent.map(item => html`<li><span>Kampanye #${item.campaignId}${item.anonymous ? html` <small>(anonim)</small>` : ""}</span><span>${formatStroops(item.amountStroops)} XLM <small>${date(item.createdAt)}</small></span></li>`)}</ul>` : html`<p class="muted">Belum berdonasi.</p>`, "Belum ada")}</section>
    </div>
    <section class="panel" aria-labelledby="history-title">
      <div class="panel-title"><div><span class="eyebrow">SNAPSHOT HARIAN</span><h2 id="history-title">Tx terkirim per hari</h2></div></div>
      ${show(history, days => days.length ? html`<ul class="list">${[...days].reverse().map(day => html`<li><span>${DAY_SHORT.format(new Date(`${day.day}T00:00:00Z`))}</span><b>${number(day.txSent)}</b></li>`)}</ul>` : html`<p class="muted">Belum ada snapshot untuk akun ini.</p>`, "Belum ada")}
    </section>`);
}
