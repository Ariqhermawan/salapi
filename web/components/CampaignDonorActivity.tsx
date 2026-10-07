"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { readPublicCampaignDonors } from "@/lib/ui/public-read";
import { useT } from "@/components/I18nProvider";
import { useMarketPrices } from "@/components/MarketPricesProvider";
import { activityStroopsToXlm } from "@/lib/wallet-activity";
import { estimateUsdc, validateMarketPrices } from "@/lib/market-prices";
import type { CampaignDonorCode, CampaignDonorEntry, CampaignDonorFeedResult } from "@/lib/campaign-donor";
import styles from "./CampaignDonorActivity.module.css";

const MAX_VISIBLE = 50;
const COPY = {
  en: { title: "Testnet donor activity", about: "Confirmed app donations only. This is not the complete historical blockchain ledger.", badge: "Confirmed Testnet", anonymous: "Anonymous", supporter: "Supporter", loading: "Loading confirmed donor records…", refresh: "Refresh donor activity", retry: "Try again", more: "Load older records", empty: "No confirmed app donor records yet.", emptyNote: "Older donations can exist on Stellar without an entry here. This does not mean the campaign received no funds.", unavailable: "Donor records are temporarily unavailable.", setup: "Donor log setup is pending.", errorNote: "This screen cannot confirm whether donor records exist. Check campaign totals and transaction receipts separately.", receipt: "View receipt", privacy: "About anonymous display", privacyNote: "Anonymous hides your name, photo, wallet and receipt link in this feed. Stellar transactions remain public; amounts or timing can still identify a donation.", limit: "Showing the latest 50 app records. Refresh to see newer donations.", wallet: "Wallet", count: "records shown" },
  id: { title: "Aktivitas donor Testnet", about: "Hanya donasi aplikasi yang terkonfirmasi. Ini bukan seluruh riwayat blockchain.", badge: "Testnet terkonfirmasi", anonymous: "Anonim", supporter: "Pendukung", loading: "Memuat catatan donor terkonfirmasi…", refresh: "Muat ulang aktivitas donor", retry: "Coba lagi", more: "Muat catatan lebih lama", empty: "Belum ada catatan donor aplikasi yang terkonfirmasi.", emptyNote: "Donasi lama bisa ada di Stellar tanpa catatan di sini. Ini tidak berarti campaign belum menerima dana.", unavailable: "Catatan donor sementara tidak tersedia.", setup: "Konfigurasi log donor belum selesai.", errorNote: "Halaman ini belum bisa memastikan keberadaan catatan donor. Periksa total campaign dan bukti transaksi secara terpisah.", receipt: "Lihat bukti transaksi", privacy: "Tentang tampilan anonim", privacyNote: "Anonim menyembunyikan nama, foto, wallet, dan tautan transaksi di feed ini. Transaksi Stellar tetap publik; nominal atau waktu masih bisa mengidentifikasi donasi.", limit: "Menampilkan 50 catatan aplikasi terbaru. Muat ulang untuk melihat donasi baru.", wallet: "Wallet", count: "catatan ditampilkan" },
  tl: { title: "Aktibidad ng Testnet donor", about: "Kumpirmadong donasyon sa app lang. Hindi ito ang buong kasaysayan ng blockchain.", badge: "Kumpirmadong Testnet", anonymous: "Anonymous", supporter: "Tagasuporta", loading: "Kinukuha ang kumpirmadong donor records…", refresh: "I-refresh ang donor activity", retry: "Subukan muli", more: "Mas lumang records", empty: "Wala pang kumpirmadong app donor records.", emptyNote: "Maaaring may lumang donasyon sa Stellar na walang record dito. Hindi ibig sabihin nito na walang natanggap na pondo.", unavailable: "Pansamantalang hindi makuha ang donor records.", setup: "Hindi pa handa ang donor log.", errorNote: "Hindi matiyak dito kung may donor records. Tingnan nang hiwalay ang campaign totals at transaction receipts.", receipt: "Tingnan ang resibo", privacy: "Tungkol sa anonymous display", privacyNote: "Itinatago ng Anonymous ang pangalan, larawan, wallet at resibo sa feed. Pampubliko pa rin ang Stellar transactions; maaaring makilala ang donasyon sa halaga o oras.", limit: "Pinakabagong 50 app records ang ipinapakita. I-refresh para sa bagong donasyon.", wallet: "Wallet", count: "records na ipinapakita" },
  vi: { title: "Hoạt động nhà tài trợ Testnet", about: "Chỉ gồm khoản quyên góp trong ứng dụng đã xác nhận. Đây không phải toàn bộ lịch sử blockchain.", badge: "Testnet đã xác nhận", anonymous: "Ẩn danh", supporter: "Người ủng hộ", loading: "Đang tải hồ sơ nhà tài trợ đã xác nhận…", refresh: "Làm mới hoạt động nhà tài trợ", retry: "Thử lại", more: "Tải hồ sơ cũ hơn", empty: "Chưa có hồ sơ quyên góp trong ứng dụng đã xác nhận.", emptyNote: "Khoản quyên góp cũ có thể tồn tại trên Stellar mà chưa được ghi ở đây. Điều này không có nghĩa chiến dịch chưa nhận tiền.", unavailable: "Tạm thời không thể tải hồ sơ nhà tài trợ.", setup: "Nhật ký nhà tài trợ chưa được cấu hình.", errorNote: "Màn hình này chưa thể xác nhận hồ sơ có tồn tại. Kiểm tra tổng chiến dịch và biên lai giao dịch riêng.", receipt: "Xem biên lai", privacy: "Về hiển thị ẩn danh", privacyNote: "Ẩn danh giấu tên, ảnh, ví và liên kết biên lai trong bảng này. Giao dịch Stellar vẫn công khai; số tiền hoặc thời gian có thể xác định khoản quyên góp.", limit: "Đang hiển thị 50 hồ sơ ứng dụng mới nhất. Làm mới để xem khoản quyên góp mới.", wallet: "Ví", count: "hồ sơ hiển thị" },
} as const;
const MARKET_COPY = {
  en: { note: "Current USDC estimates follow CoinGecko prices. Donations remain Testnet XLM.", stale: "Last known price", unavailable: "USDC estimate unavailable", fullWallet: "Full wallet address" },
  id: { note: "Estimasi USDC saat ini mengikuti harga CoinGecko. Donasi tetap berupa Testnet XLM.", stale: "Harga terakhir diketahui", unavailable: "Estimasi USDC belum tersedia", fullWallet: "Alamat wallet lengkap" },
  tl: { note: "Sumusunod sa kasalukuyang presyo ng CoinGecko ang USDC estimate. Testnet XLM pa rin ang mga donasyon.", stale: "Huling alam na presyo", unavailable: "Hindi available ang USDC estimate", fullWallet: "Buong wallet address" },
  vi: { note: "Ước tính USDC hiện tại thay đổi theo giá CoinGecko. Khoản quyên góp vẫn là Testnet XLM.", stale: "Giá gần nhất đã biết", unavailable: "Chưa có ước tính USDC", fullWallet: "Địa chỉ ví đầy đủ" },
} as const;
type FeedState = { scope: string; entries: CampaignDonorEntry[]; cursor: string | null; error: CampaignDonorCode | null; loaded: boolean; loadingMore: boolean };

function DonorPhoto({ src, initial }: { src: string | null; initial: string }) {
  const [failed, setFailed] = useState(false);
  return <span className={styles.avatar} aria-hidden="true">{src && !failed
    ? <Image src={src} alt="" width={40} height={40} unoptimized onError={() => setFailed(true)} /> : initial}</span>;
}

export default function CampaignDonorActivity({ campaignId, refreshKey = "" }: { campaignId: string; refreshKey?: string | number }) {
  const { locale } = useT(), copy = COPY[locale], titleId = useId();
  const { prices } = useMarketPrices();
  const quote = validateMarketPrices(prices), marketCopy = MARKET_COPY[locale];
  const [refresh, setRefresh] = useState(0), [state, setState] = useState<FeedState | null>(null);
  const scope = JSON.stringify([campaignId, refreshKey, refresh]);
  const current = state?.scope === scope ? state : null;
  const activeScope = useRef<string | null>(null), moreLock = useRef(false);
  const loading = current === null;

  useEffect(() => {
    let alive = true;
    activeScope.current = scope; moreLock.current = false;
    readPublicCampaignDonors(campaignId).then(result => {
      if (!alive || activeScope.current !== scope) return;
      const valid = result.campaignId === campaignId;
      setState({ scope, entries: valid && result.ok ? result.entries : [], cursor: valid && result.ok ? result.nextCursor : null,
        error: !valid ? "unavailable" : result.ok ? null : result.code, loaded: valid && result.ok, loadingMore: false });
    }).catch(() => {
      if (alive && activeScope.current === scope) setState({ scope, entries: [], cursor: null, error: "unavailable", loaded: false, loadingMore: false });
    });
    return () => { alive = false; if (activeScope.current === scope) activeScope.current = null; };
  }, [campaignId, scope]);

  async function older() {
    if (!current?.cursor || current.loadingMore || moreLock.current || current.entries.length >= MAX_VISIBLE) return;
    const cursor = current.cursor, requestedScope = scope;
    moreLock.current = true;
    setState(value => value?.scope === requestedScope ? { ...value, loadingMore: true, error: null } : value);
    let result: CampaignDonorFeedResult;
    try { result = await readPublicCampaignDonors(campaignId, cursor); }
    catch { result = { ok: false, campaignId, code: "unavailable" }; }
    if (activeScope.current !== requestedScope) return;
    moreLock.current = false;
    setState(value => {
      if (!value || value.scope !== requestedScope) return value;
      if (result.campaignId !== campaignId || !result.ok) return { ...value, loadingMore: false, error: result.ok ? "unavailable" : result.code };
      const seen = new Set(value.entries.map(item => item.id));
      return { ...value, entries: [...value.entries, ...result.entries.filter(item => !seen.has(item.id))].slice(0, MAX_VISIBLE),
        cursor: result.nextCursor, error: null, loadingMore: false };
    });
  }
  const dateLocale = { en: "en-GB", id: "id-ID", tl: "fil-PH", vi: "vi-VN" }[locale];
  const errorText = current?.error === "not_configured" ? copy.setup : copy.unavailable;
  return <section className={styles.feed} aria-labelledby={titleId} aria-busy={loading || current?.loadingMore}>
    <header className={styles.header}><div><h3 id={titleId}>{copy.title}</h3><p>{copy.about}</p></div>
      <button type="button" className={styles.refresh} aria-label={copy.refresh} disabled={loading || current?.loadingMore} onClick={() => setRefresh(value => value + 1)}>↻</button></header>
    {loading ? <p className={styles.status} role="status">{copy.loading}</p> : null}
    {current?.entries.length ? <><p className={styles.count}>{current.entries.length} {copy.count}</p><ul className={styles.list}>{current.entries.map(item => {
      // Anonymous presentation deliberately ignores every identity field, even
      // if an incompatible response unexpectedly contained one.
      const name = item.anonymous ? copy.anonymous : item.donor?.handle ? `@${item.donor.handle}` : copy.supporter;
      const usdc = estimateUsdc(item.amountStroops, quote);
      const usdcText = usdc?.toLocaleString(dateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return <li className={styles.entry} key={item.id}>
        <DonorPhoto key={`${item.id}:${item.anonymous ? "anonymous" : item.donor?.photoUrl ?? "initial"}`} src={item.anonymous ? null : item.donor?.photoUrl ?? null} initial={item.anonymous ? "A" : name.replace(/^@/, "")[0].toUpperCase()} />
        <div className={styles.body}><div className={styles.row}><strong>{name}</strong><span className={styles.amount}>{activityStroopsToXlm(item.amountStroops)} <small>XLM</small>
          {usdc !== null ? <span className={styles.estimate}>≈ {usdcText} USDC</span> : null}</span></div>
          <span className={styles.badge}>{copy.badge}</span>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(dateLocale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
          {!item.anonymous && item.donor ? <details className={styles.address}>
            <summary aria-label={`${marketCopy.fullWallet}: ${item.donor.address.slice(0, 6)}…${item.donor.address.slice(-6)}`}>
              <span>{copy.wallet}</span> <code>{item.donor.address.slice(0, 6)}…{item.donor.address.slice(-6)}</code></summary>
            <code className={styles.fullAddress}>{item.donor.address}</code>
          </details> : null}
          {item.comment ? <p className={styles.comment}>{item.comment}</p> : null}
          {!item.anonymous && item.link ? <a className={styles.receipt} href={item.link} target="_blank" rel="noopener noreferrer">{copy.receipt} ↗</a> : null}
        </div>
      </li>;
    })}</ul></> : null}
    {current?.loaded && !current.entries.length ? <div className={styles.empty}><strong>{copy.empty}</strong><p>{copy.emptyNote}</p></div> : null}
    {current?.error ? <div className={styles.error} role="status"><strong>{errorText}</strong><p>{copy.errorNote}</p>
      <button type="button" onClick={() => current.entries.length && current.cursor ? void older() : setRefresh(value => value + 1)}>{copy.retry}</button></div> : null}
    {current?.cursor && current.entries.length < MAX_VISIBLE && !current.error ? <button type="button" className={styles.more} disabled={current.loadingMore} onClick={() => void older()}>{current.loadingMore ? copy.loading : copy.more}</button> : null}
    {current && current.entries.length >= MAX_VISIBLE ? <p className={styles.status}>{copy.limit}</p> : null}
    {current?.entries.length ? <p className={styles.marketNote}>{quote.status === "unavailable" ? marketCopy.unavailable : <>
      {quote.status === "stale" ? <span className={styles.stale}>{marketCopy.stale}. </span> : null}{marketCopy.note}</>}</p> : null}
    <details className={styles.privacy}><summary>{copy.privacy}</summary><p>{copy.privacyNote}</p></details>
  </section>;
}
