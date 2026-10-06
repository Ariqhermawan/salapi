"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { walletDepositAddress } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { Ico } from "@/components/ui/kit";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import { XLM_DEPOSIT_NETWORK, type XlmDepositDetails } from "@/lib/xlm-deposit";
import { xlmDepositCopy } from "@/lib/i18n/xlm-deposit";
import s from "./XlmDepositPanel.module.css";

type DepositState = { status: "loading" | "unavailable" | "error" } | { status: "ready"; details: XlmDepositDetails };

export default function XlmDepositPanel() {
  const { locale } = useT();
  const c = xlmDepositCopy(locale);
  const [state, setState] = useState<DepositState>({ status: "loading" });
  const [reload, setReload] = useState(0);
  const [copiedAddress, setCopiedAddress] = useState("");
  const [copyError, setCopyError] = useState(false);
  useEffect(() => {
    if (isLocalPreview) return;
    let cancelled = false;
    walletDepositAddress().then(details => {
      if (!cancelled) setState(details ? { status: "ready", details } : { status: "unavailable" });
    }).catch(() => { if (!cancelled) setState({ status: "error" }); });
    return () => { cancelled = true; };
  }, [reload]);
  const details = !isLocalPreview && state.status === "ready" ? state.details : null;
  async function copyAddress() {
    if (!details) return;
    setCopyError(false);
    setCopiedAddress("");
    try { await navigator.clipboard.writeText(details.address); setCopiedAddress(details.address); }
    catch { setCopyError(true); }
  }
  function refresh() {
    setState({ status: "loading" });
    setCopiedAddress("");
    setCopyError(false);
    setReload(value => value + 1);
  }
  return <div className={`${s.panel} sl-state-enter`}>
    <header className={s.hero}><span className={s.eyebrow}>{c.eyebrow}</span><h1>{c.title}</h1><p>{c.intro}</p><span className={s.network}>{Ico.shield({ size: 15 })}{XLM_DEPOSIT_NETWORK}</span></header>
    <p className={s.warning}>{Ico.shield({ size: 18 })}<span>{c.warning}</span></p>
    {isLocalPreview ? <section className={s.card}>
      <div className={s.previewMark} aria-hidden="true">{Ico.vault({ size: 36 })}</div>
      <h2>{c.previewTitle}</h2><p>{c.previewBody}</p>
      <span className={s.addressLabel}>{c.sampleAddress}</span><code className={s.address}>{PREVIEW_WALLET.address}</code>
      <button className={s.copy} disabled>{Ico.link({ size: 17 })}{c.copy}</button>
    </section> : details ? <section className={s.card}>
      <div className={s.qr}><QRCodeSVG value={details.uri} size={164} level="M" marginSize={4} title={c.scan}/></div>
      <p className={s.qrHint}>{c.qrHint}</p>
      <span className={s.addressLabel}>{c.address}</span><code className={s.address}>{details.address}</code>
      <button className={s.copy} onClick={copyAddress}>{Ico.link({ size: 17 })}{copiedAddress === details.address ? c.copied : c.copy}</button>
      {copyError ? <p role="alert" className={s.error}>{c.copyError}</p> : null}
      <p role="status" className={s.status}>{copiedAddress === details.address ? c.copied : ""}</p>
      <dl className={s.metadata}><div><dt>{c.network}</dt><dd>{details.network}</dd></div><div><dt>{c.asset}</dt><dd>XLM</dd></div><div><dt>{c.memo}</dt><dd>{c.memoValue}</dd></div></dl>
      <p className={s.hint}>{c.memoHint}</p>
      <a className={s.explorer} href={details.explorer} target="_blank" rel="noopener noreferrer">{c.explorer}{Ico.chev({ size: 16 })}</a>
      <button className={s.secondary} onClick={refresh}>{Ico.refresh({ size: 16 })}{c.retry}</button>
    </section> : <section className={s.card} aria-busy={state.status === "loading"}>
      {state.status === "loading" ? <p role="status">{c.loading}</p> : <><h2>{c.unavailable}</h2><p role={state.status === "error" ? "alert" : undefined}>{state.status === "error" ? c.loadError : c.unavailableBody}</p><div className={s.actions}><Link href="/signin?next=%2Ftopup">{c.signin}</Link><button className={s.secondary} onClick={refresh}>{c.retry}</button></div></>}
    </section>}
    <section className={s.steps}><h2>{c.stepsTitle}</h2><ol><li>{c.step1}</li><li>{c.step2}</li><li>{c.step3}</li></ol><p>{c.inactive}</p></section>
    {!isLocalPreview && details ? <Link className={s.history} href="/activity">{c.history}{Ico.chev({ size: 16 })}</Link> : null}
  </div>;
}
