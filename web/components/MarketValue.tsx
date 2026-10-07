"use client";

import { useT } from "@/components/I18nProvider";
import { useMarketPrices } from "@/components/MarketPricesProvider";
import { formatMarketValue } from "@/lib/market-prices";
import type { Locale } from "@/lib/i18n/config";

const COPY = {
  en: { loading: "Loading market price", unavailable: "Market price unavailable", details: "CoinGecko prices", fresh: "Market estimate", stale: "Last known price", updated: "Updated", refresh: "Refresh prices", refreshWait: "Refreshing", reference: "USDC price reference only. This wallet holds Testnet XLM, not USDC.", testnet: "Testnet tokens have no monetary value.", balance: "Native Testnet XLM", noBalance: "Exact XLM balance unavailable", cadence: "Refreshes every 60 seconds while this app is visible. Not a live tick feed." },
  tl: { loading: "Kinukuha ang presyo sa merkado", unavailable: "Hindi available ang presyo", details: "Mga presyo ng CoinGecko", fresh: "Tantiyang halaga sa merkado", stale: "Huling kilalang presyo", updated: "Na-update", refresh: "I-refresh ang presyo", refreshWait: "Nagre-refresh", reference: "Sanggunian lang ang presyo ng USDC. Testnet XLM ang laman ng wallet na ito, hindi USDC.", testnet: "Walang halagang pera ang mga Testnet token.", balance: "Native Testnet XLM", noBalance: "Hindi available ang eksaktong XLM balance", cadence: "Nire-refresh bawat 60 segundo habang nakikita ang app. Hindi ito live tick feed." },
  id: { loading: "Memuat harga pasar", unavailable: "Harga pasar tidak tersedia", details: "Harga CoinGecko", fresh: "Estimasi harga pasar", stale: "Harga terakhir diketahui", updated: "Diperbarui", refresh: "Perbarui harga", refreshWait: "Memperbarui", reference: "Harga USDC hanya referensi. Wallet ini berisi XLM Testnet, bukan USDC.", testnet: "Token Testnet tidak memiliki nilai uang nyata.", balance: "XLM Testnet native", noBalance: "Saldo XLM persis tidak tersedia", cadence: "Diperbarui setiap 60 detik saat aplikasi terlihat. Bukan harga setiap tick secara langsung." },
  vi: { loading: "Đang tải giá thị trường", unavailable: "Không có giá thị trường", details: "Giá CoinGecko", fresh: "Ước tính giá thị trường", stale: "Giá gần nhất", updated: "Cập nhật", refresh: "Làm mới giá", refreshWait: "Đang làm mới", reference: "Giá USDC chỉ để tham khảo. Ví này giữ XLM Testnet, không phải USDC.", testnet: "Token Testnet không có giá trị tiền thật.", balance: "XLM Testnet gốc", noBalance: "Không có số dư XLM chính xác", cadence: "Làm mới mỗi 60 giây khi ứng dụng hiển thị. Không phải nguồn giá cập nhật từng tick." },
} satisfies Record<Locale, Record<string, string>>;
const TIME_LOCALES: Record<Locale, string> = { en: "en-US", tl: "fil-PH", id: "id-ID", vi: "vi-VN" };

function nativeAmount(stroops: string | undefined): string | null {
  if (!stroops || !/^(?:0|[1-9]\d{0,18})$/.test(stroops)) return null;
  const value = BigInt(stroops);
  if (value > 9_223_372_036_854_775_807n) return null;
  const fraction = (value % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return `${value / 10_000_000n}${fraction ? `.${fraction}` : ""}`;
}

/** This is a current market reference, never an asset balance or transaction quote. */
export default function MarketValue({ nativeStroops, size = 32, color = "currentColor", compact = false, showNative = true }: { nativeStroops?: string; size?: number; color?: string; compact?: boolean; showNative?: boolean }) {
  const { locale, currency } = useT();
  const { prices, loading, refresh } = useMarketPrices();
  const c = COPY[locale];
  const quantity = nativeAmount(nativeStroops);
  const value = nativeStroops ? formatMarketValue(nativeStroops, prices, currency) : null;
  const quote = prices.status === "unavailable" ? null : prices;
  const updated = quote ? Math.min(quote.assets.xlm.updatedAt, quote.assets.usdc.updatedAt) * 1000 : null;
  const timestamp = updated === null ? null : new Intl.DateTimeFormat(TIME_LOCALES[locale], { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(updated);
  const usdPrice = (number: number) => new Intl.NumberFormat(TIME_LOCALES[locale], { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(number);
  const onDark = /255\s*,\s*255\s*,\s*255|#fff/i.test(color);
  return <div data-market-value={value === null ? "unavailable" : prices.status} style={{ color, minWidth: 0, width: "100%", whiteSpace: "normal" }}>
    <div data-market-estimate aria-live="polite" role="status" style={{ fontWeight: 800, letterSpacing: "-.04em", lineHeight: 1.1, fontSize: value === null ? compact ? 12 : 16 : compact ? Math.max(20, size - 4) : size, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>
      {value === null ? !quantity ? c.noBalance : loading ? c.loading : c.unavailable : `≈ ${value}`}
    </div>
    {showNative && quantity !== null && <div data-native-balance={nativeStroops} aria-label={`${quantity} ${c.balance}`} style={{ fontWeight: 500, fontSize: compact ? 14 : 16, lineHeight: 1.3, marginTop: compact ? 4 : 6, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere", letterSpacing: "normal" }}>{quantity} <span style={{ fontSize: compact ? 11 : 12, opacity: .88 }}>XLM</span></div>}
    <div data-price-attribution="coingecko" style={{ display: "flex", flexWrap: "wrap", justifyContent: compact ? "center" : "flex-start", alignItems: "center", gap: 5, fontSize: 10, lineHeight: "16px", marginTop: 5, letterSpacing: "normal", fontWeight: 400 }}>
      <span>Data powered by</span>
      <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer" aria-label="CoinGecko" style={{ display: "inline-flex", alignItems: "center", minHeight: 24 }}>
        {/* Official unmodified Brand Kit lockup, not an attribution sample. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={onDark ? "/brands/coingecko.svg" : "/brands/coingecko-white.svg"} width={73} height={16} alt="CoinGecko" style={{ display: "block", width: "auto", height: 16 }} />
      </a>
    </div>
    <details style={{ marginTop: compact ? 0 : 8, fontSize: compact ? 9 : 12, lineHeight: 1.45, letterSpacing: "normal", fontWeight: 400, textAlign: compact ? "center" : "left" }}>
      <summary aria-label={c.details} style={{ cursor: "pointer", opacity: .88, minHeight: 24 }}>{prices.status === "stale" ? c.stale : quote ? c.updated : c.details}{timestamp ? ` · ${timestamp}` : ""}</summary>
      <div style={{ padding: "8px 0 2px", display: "grid", gap: 5 }}>
        {!showNative && quantity !== null && <span>{quantity} {c.balance}</span>}
        {quote && <><span>{c.fresh}: XLM {usdPrice(quote.assets.xlm.prices.usd)} · USDC {usdPrice(quote.assets.usdc.prices.usd)}</span><time dateTime={new Date(updated!).toISOString()}>{c.updated}: {new Intl.DateTimeFormat(TIME_LOCALES[locale], { dateStyle: "medium", timeStyle: "medium" }).format(updated!)}</time></>}
        <span>{c.reference}</span><span>{c.testnet}</span><span>{c.cadence}</span>
        <button type="button" disabled={loading} onClick={() => { void refresh(); }} style={{ cursor: loading ? "wait" : "pointer", textDecoration: "underline", fontWeight: 650, color: "inherit", textAlign: "inherit", padding: "6px 0" }}>{loading ? c.refreshWait : c.refresh}</button>
      </div>
    </details>
  </div>;
}
