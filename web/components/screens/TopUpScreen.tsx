"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { walletState, topUpSandbox } from "@/app/actions";
import { requireWalletState } from "@/lib/wallet-state";
import { useT } from "@/components/I18nProvider";
import { T, Ico, AppBar, IconButton, Card, Btn, Chip, Money, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import PaymentProviderDemo from "./PaymentProviderDemo";
import PaymentChannelOptions from "./PaymentChannelOptions";
import SuccessMotion from "@/components/ui/SuccessMotion";
import { accountCopy, type AccountCopyKey } from "@/lib/i18n/revamp-account";
import { xlmDepositCopy } from "@/lib/i18n/xlm-deposit";
import XlmDepositPanel from "./XlmDepositPanel";
import depositStyles from "./XlmDepositPanel.module.css";
import MarketValue from "@/components/MarketValue";

export default function TopUpScreen() {
  const { t, locale } = useT();
  const c = accountCopy(locale);
  const router = useRouter();
  const goBack = useGoBack("/");
  const [wallet, setWallet] = useState<{ address: string; pesos: number; nativeStroops?: string } | null>(isLocalPreview ? PREVIEW_WALLET : null);
  const [result, setResult] = useState<{ funded: boolean; pesos: number; nativeStroops?: string } | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<AccountCopyKey | "">("");
  const submitting = useRef(false);
  const [faucet,setFaucet]=useState(false);
  const [method,setMethod]=useState<"topup"|"xlm"|"provider">(isLocalPreview ? "topup" : "xlm");
  const depositCopy = xlmDepositCopy(locale);
  useEffect(() => {
    if (isLocalPreview || method !== "topup") return;
    let cancelled = false;
    walletState().then(requireWalletState).then(value => { if (!cancelled) setWallet(value); }).catch(() => { if (!cancelled) setError("walletLoad"); });
    return () => { cancelled = true; };
  }, [method]);
  function fund() {
    if (submitting.current) return;
    submitting.current = true;
    start(async () => {
      setError("");
      try {
        if (isLocalPreview) { setResult({ funded: true, pesos: PREVIEW_WALLET.pesos }); return; }
        const r = await topUpSandbox();
        setResult({ funded: r.funded, pesos: r.pesos, nativeStroops: r.nativeStroops });
        setWallet(w => w ? { ...w, pesos: r.pesos, nativeStroops: r.nativeStroops } : w);
      } catch { setError("fundingError"); }
      finally { submitting.current = false; }
    });
  }
  const navigation = <nav className={depositStyles.methods} style={{ gridTemplateColumns: "repeat(3,minmax(0,1fr))" }} aria-label={depositCopy.methods}>
    <button type="button" aria-pressed={method === "topup" && (!isLocalPreview || !faucet)} onClick={()=>{setMethod("topup");if(isLocalPreview)setFaucet(false);}}>{Ico.arrowDown({size:17})}{isLocalPreview ? depositCopy.provider : depositCopy.faucet}</button>
    <button type="button" aria-pressed={method === "xlm"} onClick={()=>setMethod("xlm")}>{Ico.qr({size:17})}{depositCopy.deposit}</button>
    {isLocalPreview ? <button type="button" aria-pressed={method === "topup" && faucet} onClick={()=>{setMethod("topup");setFaucet(true);}}>{depositCopy.faucet}</button> : <button type="button" aria-pressed={method === "provider"} onClick={()=>setMethod("provider")}>{depositCopy.paymentMethods}</button>}
  </nav>;
  // Payment-channel discovery must not load, fund or provision a wallet.
  // Real checkout remains unavailable until an authenticated provider flow exists.
  if(method === "provider") return <div style={{ fontFamily:T.fontSans, color:T.ink, paddingBottom:24 }}>
    <AppBar title={t("topup.title")} leading={<IconButton ariaLabel={c.back} onClick={goBack}>{Ico.back({})}</IconButton>}/>
    {navigation}
    <div style={{padding:"4px 16px"}}>
      <Card p={20} style={{marginBottom:16,background:"#F2EFE7"}}>
        <Chip kind="warn">{c.providersDisconnected}</Chip>
        <h1 style={{fontSize:26,lineHeight:1.2,letterSpacing:"-.03em",margin:"14px 0 10px"}}>{depositCopy.paymentMethods}</h1>
        <p style={{fontSize:13,lineHeight:1.55,color:T.slate,margin:0}}>{c.providerSetup}</p>
      </Card>
      <PaymentChannelOptions payout={false}/>
      <p style={{fontSize:12,lineHeight:1.55,color:T.slate}}>{c.noProviderRequest}</p>
      <div style={{display:"flex",justifyContent:"center",marginTop:20}}><PoweredByStellar/></div>
    </div>
  </div>;
  if(method === "xlm") return <div style={{ fontFamily:T.fontSans, color:T.ink, paddingBottom:24 }}>
    <AppBar title={t("topup.title")} leading={<IconButton ariaLabel={c.back} onClick={goBack}>{Ico.back({})}</IconButton>}/>
    {navigation}<XlmDepositPanel/>
    <div style={{display:"flex",justifyContent:"center",marginTop:20}}><PoweredByStellar/></div>
  </div>;
  if(isLocalPreview && !faucet)return <PaymentProviderDemo onFaucet={()=>setFaucet(true)} topupNavigation={navigation}/>;
  return <div style={{ fontFamily: T.fontSans, color: T.ink, minHeight: "100%", paddingBottom: 24 }}>
    <AppBar title={t("topup.title")} leading={<IconButton ariaLabel={c.back} onClick={goBack}>{Ico.back({})}</IconButton>} />
    {navigation}
    <div style={{ padding: "4px 20px" }}>
      {result?.funded ? <SuccessMotion title={isLocalPreview ? c.fundingDemoSuccess : c.friendbotAccepted}><p>{isLocalPreview ? c.noNetworkBalance : c.refreshedBalance}</p></SuccessMotion> : null}
      <div style={{ borderRadius: 24, background: "#F2EFE7", padding: 22, marginBottom: 18 }}><Chip kind="warn">{isLocalPreview ? c.localPreview : c.testnetFaucet}</Chip><h1 style={{ margin: "14px 0 8px", fontSize: 30, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-.04em" }}>{result ? c.readyExplore : c.fuelExplore}</h1><p style={{ margin: 0, color: T.slate, lineHeight: 1.55, fontSize: 14 }}>{isLocalPreview ? c.fundingDemoIntro : c.friendbotIntro}</p></div>
      <Card p={22} elevation><div style={{ fontSize: 12, color: T.slate }}>{c.testnetBalance}</div>{wallet ? <div style={{ marginTop: 8 }}>{isLocalPreview ? <><Money value={result?.pesos ?? wallet.pesos} size={36} usdc={false} /><p style={{ fontSize: 12, color: T.slate }}>{c.illustrativeValue}</p></> : <MarketValue nativeStroops={result?.nativeStroops ?? wallet.nativeStroops} size={36} />}</div> : <p>{error === "walletLoad" ? c.walletLoad : c.loadingWallet}</p>}{wallet && <div style={{ fontFamily: T.fontMono, fontSize: 11, wordBreak: "break-all", color: T.slate, marginTop: 18 }}>{wallet.address}</div>}</Card>
      {result ? <Card p={18} style={{ marginTop: 18, background: T.moneyInTint }}><strong style={{ color: T.moneyIn }}>{isLocalPreview ? c.localFundingDone : result.funded ? c.friendbotRequestAccepted : c.noFundingConfirmed}</strong><p style={{ margin: "8px 0 0", fontSize: 13, color: T.slate, lineHeight: 1.5 }}>{isLocalPreview ? c.noNetworkWallet : result.funded ? c.friendbotResult : c.friendbotNoResult}</p></Card> : <Card p={18} style={{ marginTop: 18 }}><strong>{c.howTopup}</strong><p style={{ margin: "8px 0 0", color: T.slate, lineHeight: 1.55, fontSize: 13 }}>{c.topupPlanned}</p></Card>}
      {error && <p role="alert" style={{ color: T.danger, fontSize: 13, lineHeight: 1.5 }}>{c[error]}</p>}
      <div style={{ marginTop: 20 }}><Btn kind="primary" disabled={pending || !wallet} loading={pending} onClick={result ? () => router.push("/") : fund}>{result ? c.home : isLocalPreview ? c.tryFunding : c.requestXlm}</Btn>{result && !isLocalPreview && wallet && <a href={"https://stellar.expert/explorer/testnet/account/" + wallet.address} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", color: T.action, fontWeight: 700, fontSize: 13, padding: 18 }}>{c.walletHistory}</a>}</div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}><PoweredByStellar /></div>
    </div>
  </div>;
}
