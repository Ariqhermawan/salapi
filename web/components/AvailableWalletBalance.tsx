"use client";
import { useT } from "@/components/I18nProvider";
import { useOwnedAccountRead } from "@/lib/ui/useOwnedAccountRead";
import type { AvailableBalance } from "@/lib/available-balance";
import { formatStroops } from "@/lib/format-stroops";
import { isLocalPreview } from "@/lib/local-preview";
import styles from "./AvailableWalletBalance.module.css";
const COPY = {
  en: { title: "Available balance", loading: "Checking your wallet…", unavailable: "Balance unavailable", retry: "Refresh balance", note: "Testnet XLM, after reserve and liabilities. Leave room for network fees.", reserve: "Network reserve", over: "This amount exceeds your available XLM.", demo: "Local demo, no live wallet balance." },
  id: { title: "Saldo tersedia", loading: "Memeriksa wallet kamu…", unavailable: "Saldo belum tersedia", retry: "Muat ulang saldo", note: "XLM Testnet, setelah cadangan dan kewajiban. Sisakan saldo untuk biaya jaringan.", reserve: "Cadangan jaringan", over: "Nominal ini melebihi XLM yang tersedia.", demo: "Simulasi lokal, bukan saldo wallet live." },
  tl: { title: "Available na balanse", loading: "Sinusuri ang wallet mo…", unavailable: "Hindi available ang balanse", retry: "I-refresh ang balanse", note: "Testnet XLM, matapos ang reserve at liabilities. Magtira para sa network fees.", reserve: "Network reserve", over: "Higit ang halaga sa available mong XLM.", demo: "Lokal na demo, hindi live wallet balance." },
  vi: { title: "Số dư khả dụng", loading: "Đang kiểm tra ví…", unavailable: "Chưa có số dư", retry: "Tải lại số dư", note: "XLM Testnet sau dự trữ và nghĩa vụ. Giữ lại tiền cho phí mạng.", reserve: "Dự trữ mạng", over: "Số tiền vượt quá XLM khả dụng.", demo: "Mô phỏng cục bộ, không phải số dư ví thật." },
};
type Response = { ok: true; ownerId: string; balance: AvailableBalance };
function valid(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;
  const v = value as Response;
  return v.ok === true && typeof v.ownerId === "string" && !!v.balance && [v.balance.availableStroops, v.balance.nativeStroops, v.balance.reserveStroops, v.balance.liabilitiesStroops].every(x => typeof x === "string" && /^\d{1,20}$/.test(x));
}
export default function AvailableWalletBalance({ amountStroops }: { amountStroops?: bigint | null }) {
  const { locale } = useT(), c = COPY[locale];
  const state = useOwnedAccountRead("/api/account/spending", valid);
  if (isLocalPreview) return <p className={styles.demo}>{c.demo}</p>;
  if (state.status === "guest") return null;
  const balance = state.value?.balance;
  return <aside className={styles.balance} data-testid="available-wallet-balance" aria-label={c.title}>
    <div><span>{c.title}</span>{balance ? <strong>{formatStroops(balance.availableStroops)} <small>XLM</small></strong>
      : <span role="status">{state.status === "loading" ? c.loading : c.unavailable}</span>}
      <button type="button" onClick={state.refresh} disabled={state.status === "loading"} aria-label={c.retry}>↻</button></div>
    {balance ? <><p>{c.note}</p>{amountStroops != null && amountStroops > BigInt(balance.availableStroops) ? <p className={styles.error} role="alert">{c.over}</p> : null}
      <details><summary>{c.reserve}: {formatStroops(balance.reserveStroops)} XLM</summary><span>{formatStroops(balance.nativeStroops)} XLM total · {formatStroops(balance.liabilitiesStroops)} XLM liabilities</span></details></> : null}
  </aside>;
}
