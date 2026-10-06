"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { AppBar, Btn, Ico, IconButton, Money, PoweredByStellar } from "@/components/ui/kit";
import SuccessMotion from "@/components/ui/SuccessMotion";
import { useT } from "@/components/I18nProvider";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import { CURRENCY, formatLocalAmount, localAmount } from "@/lib/ui/currency";
import { demoAmountMinor, nextDemoPaymentStatus, type DemoPaymentEvent, type DemoPaymentStatus } from "@/lib/provider-demo";
import type { Locale } from "@/lib/i18n/config";
import { accountCopy, accountText } from "@/lib/i18n/revamp-account";
import styles from "./PaymentProviderDemo.module.css";

const QUICK: Record<Locale,string[]>={en:["2","5","10","20"],tl:["100","250","500","1000"],id:["25000","50000","100000","250000"],vi:["50000","100000","200000","500000"]};

export default function PaymentProviderDemo({payout=false,onFaucet,topupNavigation}:{payout?:boolean;onFaucet?:()=>void;topupNavigation?:ReactNode}) {
  const {currency,locale}=useT();
  const c=accountCopy(locale);
  const goBack=useGoBack("/");
  const [amount,setAmount]=useState("");
  const [provider,setProvider]=useState<"xendit"|"mayar">("xendit");
  const [status,setStatus]=useState<DemoPaymentStatus>("entry");
  const [destination,setDestination]=useState("bank");
  const meta=CURRENCY[currency];
  const units=demoAmountMinor(amount,meta.dp);
  const scale=10**meta.dp;
  const balanceMinor=BigInt(Math.floor(localAmount(PREVIEW_WALLET.pesos,currency)*scale));
  const valid=units!==null && (!payout || units<=balanceMinor);
  const value=units===null ? 0 : Number(units)/scale;
  const destinationLabel=destination==="bank"?c.exampleBank:c.exampleWallet;
  function advance(event:DemoPaymentEvent){
    if((event==="review" || event==="confirm") && (!valid || payout && provider!=="xendit"))return;
    setStatus(s=>nextDemoPaymentStatus(s,event,isLocalPreview,payout));
  }
  function portion(fraction:number){setAmount((Number(balanceMinor*BigInt(Math.round(fraction*100))/100n)/scale).toFixed(meta.dp));}
  if(!isLocalPreview)return null;
  return <div className={styles.screen}>
    <AppBar title={payout?c.withdraw:c.topup} leading={<IconButton ariaLabel={c.back} onClick={()=>status==="review"?advance("edit"):goBack()}>{Ico.back({})}</IconButton>}/>
    {!payout ? topupNavigation : null}
    <div className={styles.body}>
      <header className={styles.hero}><span className={styles.eyebrow}>{c.providerLocal}</span><h1>{payout?c.planCashOut:c.addRoom}</h1><p>{payout?c.rehearsePayout:c.exploreCheckout}</p><span className={styles.connection}>{c.providersDisconnected}</span></header>
      {payout?<section className={styles.balance}><span>{c.illustrativeBalance}</span><Money value={PREVIEW_WALLET.pesos} size={34} color="#fff" usdc={false}/><small>{c.notCash}</small></section>:null}
      <div key={status} className="sl-state-enter">
      {status==="entry"?<>
        <section className={styles.card}><label htmlFor="provider-demo-amount">{c.demoAmount} · {meta.code}</label><input id="provider-demo-amount" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} maxLength={24} placeholder={meta.dp===0?"0":"0.00"}/><div className={styles.presets}>{payout?[.25,.5,.75,1].map(p=><button type="button" key={p} onClick={()=>portion(p)}>{p===1?c.max:`${p*100}%`}</button>):QUICK[currency].map(q=><button type="button" key={q} aria-pressed={q===amount} onClick={()=>setAmount(q)}>{formatLocalAmount(Number(q),currency)}</button>)}</div>{amount && !valid?<p role="alert" className={styles.error}>{units===null?accountText(locale,"decimalError",{dp:meta.dp}):c.overIllustrative}</p>:null}</section>
        <fieldset className={styles.providers}><legend>{payout?c.payoutProvider:c.paymentProvider}</legend>{(["xendit","mayar"] as const).map(p=><label key={p} className={provider===p?styles.selected:""}><input type="radio" name="provider" value={p} checked={provider===p} disabled={payout&&p==="mayar"} onChange={()=>{if(!payout || p==="xendit")setProvider(p);}}/><span className={styles.providerMark}>{p==="xendit"?"X":"M"}</span><span><strong>{p==="xendit"?"Xendit":"Mayar.id"}</strong><small>{payout&&p==="mayar"?c.mayarUnavailable:c.demoSelection}</small></span></label>)}</fieldset>
        {payout?<section className={styles.card}><label htmlFor="demo-destination">{c.exampleDestination}</label><select id="demo-destination" value={destination} onChange={e=>setDestination(e.target.value)}><option value="bank">{c.exampleBank}</option><option value="wallet">{c.exampleWallet}</option></select><small>{c.noAccountDetails}</small></section>:null}
        <Btn disabled={!valid} onClick={()=>advance("review")}>{payout?c.reviewPayout:c.reviewTopup}</Btn>
      </>:<>
        <section className={styles.ticket}><span className={styles.eyebrow}>{c.demonstratedAmount}</span><strong>{formatLocalAmount(value,currency)}</strong><dl><div><dt>{c.provider}</dt><dd>{provider==="xendit"?"Xendit":"Mayar.id"}</dd></div>{payout?<div><dt>{c.destination}</dt><dd>{destinationLabel}</dd></div>:null}<div><dt>{c.providerFee}</dt><dd>{c.notConfigured}</dd></div><div><dt>{c.status}</dt><dd>{status==="review"?c.notStarted:`${c[status]} · ${c.simulated}`}</dd></div><div><dt>{c.balanceChange}</dt><dd>{c.none}</dd></div></dl><p>{c.noProviderRequest}</p></section>
        {status==="review"?<div className={styles.actions}>{!valid?<p role="alert" className={styles.error}>{c.invalidCurrency}</p>:null}<Btn disabled={!valid || payout && provider!=="xendit"} onClick={()=>advance("confirm")}>{payout?c.confirmPayout:c.confirmTopup}</Btn><Btn kind="ghost" onClick={()=>advance("edit")}>{c.editAmount}</Btn></div>:null}
        {status==="pending"?<section className={styles.card}><h2>{c.awaitExample}</h2><p>{c.outcomeIntro}</p><div className={styles.outcomes}><button onClick={()=>advance("succeeded")}>{c.showSuccess}</button><button onClick={()=>advance("failed")}>{c.showFailure}</button>{!payout?<button onClick={()=>advance("expired")}>{c.showExpired}</button>:null}</div></section>:null}
        {status==="succeeded"?<SuccessMotion title={payout?c.payoutDone:c.topupDone}><p>{c.noMoneyMoved}</p></SuccessMotion>:null}
        {["failed","expired","reversed"].includes(status)?<section className={styles.outcomeNotice} role="status"><strong>{status!=="review"?c[status]:c.notStarted} · {c.exampleOutcome}</strong><p>{c.noTransaction}</p></section>:null}
        {status==="succeeded"&&payout?<button className={styles.textButton} onClick={()=>advance("reversed")}>{c.exploreReversed}</button>:null}
        {status!=="review"?<div className={styles.actions}><Btn kind="secondary" onClick={()=>advance("reset")}>{c.anotherDemo}</Btn></div>:null}
      </>}
      </div>
      <section className={styles.explanation}><h2>{payout?c.livePayout:c.liveTopup}</h2><ol><li>{payout?c.identityFiat:c.serverRequest}</li><li>{payout?c.serverReserve:c.hostedCheckout}</li><li>{c.serverValidate}</li><li>{c.ledgerSettle}</li></ol><p>{payout?c.notSettled:c.noReturnCredit} {c.providerSetup}</p><Link href="/you/kyc-tier">{c.exploreKyc} {Ico.chev({size:15})}</Link></section>
      {onFaucet?<button className={styles.faucet} onClick={onFaucet}>{c.separateXlm} {Ico.chev({size:17})}</button>:null}
      <footer className={styles.footer}><PoweredByStellar/><small>{c.localOnly}</small></footer>
    </div>
  </div>;
}
