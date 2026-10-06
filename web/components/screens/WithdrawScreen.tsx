"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { walletState, withdrawSandbox } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Ico, AppBar, IconButton, Card, Row, Btn, Chip, Money, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { CURRENCY, formatLocalAmount, localAmount, pesoFromLocal } from "@/lib/ui/currency";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import PaymentProviderDemo from "./PaymentProviderDemo";
import PaymentChannelOptions from "./PaymentChannelOptions";
import SuccessMotion from "@/components/ui/SuccessMotion";
import { accountCopy, type AccountCopyKey } from "@/lib/i18n/revamp-account";

export default function WithdrawScreen() {
  const { t, locale, currency } = useT();
  const c = accountCopy(locale);
  const router = useRouter();
  const goBack = useGoBack("/");
  const [balance, setBalance] = useState<{ pesos: number } | null>(isLocalPreview ? PREVIEW_WALLET : null);
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<AccountCopyKey | "">("");
  const submitting = useRef(false);
  const value = Number(amount);
  const pesos = pesoFromLocal(value, currency);
  const valid = /^\d+(\.\d+)?$/.test(amount) && Number.isFinite(value) && value > 0 && balance !== null && pesos <= balance.pesos;
  const dest = locale === "id" ? c.bankWallet : "GCash";
  useEffect(() => { if (!isLocalPreview) walletState().then(setBalance).catch(() => setError("balanceLoad")); }, []);
  function selectPortion(portion: number) {
    if (!balance) return;
    const scale = 10 ** CURRENCY[currency].dp;
    // Round down, so a Max chip cannot exceed the underlying balance.
    const display = Math.floor(localAmount(balance.pesos * portion, currency) * scale) / scale;
    setAmount(display.toFixed(CURRENCY[currency].dp));
    setError("");
  }
  function confirm() {
    if (!valid || submitting.current) return;
    submitting.current = true;
    start(async () => {
      try { setError(""); if (!isLocalPreview) await withdrawSandbox(pesos); setDone(true); }
      catch { setError("sandboxError"); }
      finally { submitting.current = false; }
    });
  }
  if(isLocalPreview)return <PaymentProviderDemo payout/>;
  return <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 24 }}>
    <AppBar title={t("withdraw.title")} leading={<IconButton ariaLabel={c.back} onClick={() => review && !done ? setReview(false) : goBack()}>{Ico.back({})}</IconButton>} />
    <div style={{ padding: "4px 20px" }}>
      {done ? <SuccessMotion title={c.withdrawalDone}><p>{c.noMoneyBalance}</p></SuccessMotion> : null}
      <div style={{ padding: 22, borderRadius: 24, background: "#F2EFE7", marginBottom: 18 }}><Chip kind="warn">{c.noCashOut}</Chip><h1 style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-.04em", margin: "14px 0 8px" }}>{done ? c.triedFlow : review ? c.reviewDemo : c.planCashOut}</h1><p style={{ fontSize: 14, color: T.slate, lineHeight: 1.55, margin: 0 }}>{done ? c.noBankMoney : c.withdrawalIntro}</p></div>
      {!review && !done && <PaymentChannelOptions payout/>}
      <Card p={22} elevation style={{ background: "#102249", color: "#fff" }}><div style={{ color: "#CAD5EB", fontSize: 12 }}>{c.balanceIllustrative}</div><div style={{ marginTop: 8 }}>{balance ? <Money value={balance.pesos} size={36} color="#fff" usdc={false} /> : c.loading}</div></Card>
      {done ? <div style={{ marginTop: 20 }}><Card p={20}><Row title={c.demonstratedAmount} trailing={<strong>{formatLocalAmount(value, currency)}</strong>} /><Row title={c.destinationPreview} trailing={<strong>{dest}</strong>} /><Row title={c.tokensMoved} trailing={<strong>{c.none}</strong>} divider={false} /></Card><div style={{ marginTop: 20 }}><Btn kind="primary" onClick={() => router.push("/")}>{c.home}</Btn><Btn kind="ghost" onClick={() => { setDone(false); setReview(false); setAmount(""); }}>{c.tryAmount}</Btn></div></div> : review ? <div style={{ marginTop: 20 }}><Card p={20}><Row title={c.displayAmount} trailing={<strong>{formatLocalAmount(value, currency)}</strong>} /><Row title={c.destinationPreview} trailing={<strong>{dest}</strong>} /><Row title={c.network} trailing={<Chip kind="warn">Testnet</Chip>} divider={false} /><p style={{ color: T.slate, fontSize: 13, lineHeight: 1.5 }}>{c.withdrawalWarning}</p></Card><div style={{ marginTop: 20 }}><Btn kind="primary" disabled={pending || !valid} loading={pending} onClick={confirm}>{c.confirmSandbox}</Btn><Btn kind="ghost" disabled={pending} onClick={() => setReview(false)}>{c.editAmount}</Btn></div></div> : <div style={{ marginTop: 20 }}><Card p={20}><label htmlFor="withdraw-amount" style={{ fontSize: 13, fontWeight: 700 }}>{c.demoAmount} · {CURRENCY[currency].code}</label><input id="withdraw-amount" value={amount} inputMode="decimal" placeholder="0.00" maxLength={64} onChange={e => setAmount(e.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", border: "1px solid " + T.hairline, borderRadius: 16, margin: "12px 0", padding: 16, fontSize: 36, fontWeight: 800, background: T.surface, color: T.ink }} /><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{[0.25,0.5,0.75,1].map(p => <button key={p} type="button" disabled={!balance} onClick={() => selectPortion(p)} style={{ border: 0, background: T.actionTint, color: T.action, borderRadius: 99, padding: "9px 14px", fontWeight: 700 }}>{p === 1 ? c.max : String(p*100) + "%"}</button>)}</div>{balance && pesos > balance.pesos && <p role="alert" style={{ color: T.danger, fontSize: 12 }}>{c.overBalance}</p>}</Card><p style={{ fontSize: 12, color: T.slate, lineHeight: 1.5, margin: "18px 0" }}>{c.withdrawalsPlanned}</p><Btn kind="primary" disabled={!valid} onClick={() => setReview(true)}>{c.reviewSandbox}</Btn></div>}
      {error && <p role="alert" style={{ color: T.danger, fontSize: 13 }}>{c[error]}</p>}<div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}><PoweredByStellar /></div>
    </div>
  </div>;
}
