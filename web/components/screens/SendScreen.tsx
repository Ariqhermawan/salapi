"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerUsername, myHandle, sendByUsername, lookupRecipient, checkSubmittedTransfer } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
import { T, Ico, AppBar, IconButton, Btn, Avatar, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { CURRENCY, formatLocalAmount, pesoFromLocal } from "@/lib/ui/currency";
import { localToStroops, pesosToStroopsExact } from "@/lib/money";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import { recordPreviewTransfer } from "@/lib/local-preview-history";
import type { Locale } from "@/lib/i18n/config";
import styles from "./SendRevamp.module.css";
import SuccessMotion from "@/components/ui/SuccessMotion";
import TransferMotion from "@/components/ui/TransferMotion";

const QUICK: Record<Locale, string[]> = { en: ["2", "5", "10", "20"], tl: ["100", "500", "1000", "2000"], id: ["20000", "50000", "100000", "200000"], vi: ["50000", "100000", "200000", "500000"] };
const MAX_TRANSFER_STROOPS = pesosToStroopsExact("1000000000")!;
const UNRESOLVED_SEND_KEY = "salapi:testnet:unresolved-send:v1";
type UnresolvedSend = { hash: string | null };

function storedUnresolvedSend(): UnresolvedSend | null {
  if (isLocalPreview || typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(UNRESOLVED_SEND_KEY);
    if (value === "unknown") return { hash: null };
    return value && /^[a-f0-9]{64}$/.test(value) ? { hash: value } : null;
  } catch { return null; }
}

export default function SendScreen({ initialTo }: { initialTo?: string }) {
  const { t, currency, locale } = useT();
  const m = moneyCopy(locale);
  const router = useRouter();
  const goBack = useGoBack("/");
  const [mine, setMine] = useState<string | null>(isLocalPreview ? PREVIEW_WALLET.handle : null);
  const [claim, setClaim] = useState("");
  const [to, setTo] = useState((initialTo ?? "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32));
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState<{ username: string; address: string } | null>(null);
  const [pending, start] = useTransition();
  const [transferPhase, setTransferPhase] = useState<"send" | "check" | null>(null);
  const submitting = useRef(false);
  const [done, setDone] = useState<{ link?: string; address?: string; hash?: string; statusOnly?: boolean; localReceiptSaved?: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [unresolved, setUnresolved] = useState<UnresolvedSend | null>(null);
  const unresolvedRef = useRef<UnresolvedSend | null>(null);
  const clean = to.trim().toLowerCase();
  const units = localToStroops(amount, currency);
  const displayPesos = pesoFromLocal(Number(amount), currency);
  const withinAmountLimit = Number.isFinite(displayPesos) && displayPesos <= 1_000_000_000 && (units === null || units <= MAX_TRANSFER_STROOPS);
  const self = !!mine && clean === mine.toLowerCase();
  const valid = /^[a-z0-9_]{3,32}$/.test(clean) && units !== null && units > 0n && !self && withinAmountLimit;
  const xlm = units === null ? "0" : String(units / 10_000_000n) + "." + String(units % 10_000_000n).padStart(7, "0");

  useEffect(() => {
    if (isLocalPreview) return;
    const saved = storedUnresolvedSend();
    unresolvedRef.current = saved;
    // Restore browser-only session state after hydration, never in SSR output.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnresolved(saved);
    myHandle().then(setMine).catch(() => setErr("Your username could not be loaded. Please try again."));
  }, []);

  function retainUnresolved(value: UnresolvedSend): boolean {
    if (isLocalPreview) return false;
    if (typeof window !== "undefined") {
      try {
        const stored = value.hash ?? "unknown";
        sessionStorage.setItem(UNRESOLVED_SEND_KEY, stored);
        if (sessionStorage.getItem(UNRESOLVED_SEND_KEY) !== stored) return false;
      } catch { return false; }
    }
    unresolvedRef.current = value;
    setUnresolved(value);
    return true;
  }

  function clearUnresolved() {
    unresolvedRef.current = null;
    setUnresolved(null);
    try { if (typeof window !== "undefined") sessionStorage.removeItem(UNRESOLVED_SEND_KEY); } catch { /* a stale lock is safer than a retry */ }
  }

  function doClaim() {
    if (isLocalPreview) { setMine(claim.trim().toLowerCase()); return; }
    start(async () => {
      setErr("");
      try { const r = await registerUsername(claim); if (r.ok) setMine(r.name); else setErr(r.error); }
      catch { setErr(m("The username service is unavailable. Please try again.")); }
    });
  }

  function reviewTransfer() {
    if (!valid || pending || unresolvedRef.current || storedUnresolvedSend()) return;
    start(async () => {
      setErr("");
      try {
        const r = await lookupRecipient(clean);
        if (r.ok) {
          if (r.address === PREVIEW_WALLET.address && isLocalPreview) { setErr(m("You cannot send to yourself.")); return; }
          setRecipient({ username: r.username, address: r.address });
        } else setErr(r.error);
      } catch { setErr(m("We could not check this recipient. Please try again when the service is available.")); }
    });
  }

  function doSend() {
    if (!valid || !recipient || submitting.current || unresolvedRef.current) return;
    const saved = storedUnresolvedSend();
    if (saved) { unresolvedRef.current = saved; setUnresolved(saved); return; }
    // Save an uncertainty marker before the server call, so a reload or lost
    // response cannot quietly turn an in-flight send into a fresh confirmation.
    if (!isLocalPreview && !retainUnresolved({ hash: null })) {
      setErr(m("Browser storage is unavailable. Sending is blocked because an unfinished transaction could not be retained safely."));
      return;
    }
    submitting.current = true;
    setTransferPhase("send");
    start(async () => {
      setErr("");
      try {
        if (isLocalPreview) {
          const receipt = units !== null ? recordPreviewTransfer({ recipientHandle: recipient.username, recipientAddress: recipient.address, pesos: displayPesos, amountStroops: units.toString() }) : null;
          setDone({ address: recipient.address, localReceiptSaved: receipt !== null });
          if (!receipt) setErr(m("This demo did not move tokens. Browser storage could not save its receipt, so it will not appear in Activity."));
          return;
        }
        const r = await sendByUsername(recipient.username, { amount, currency }, recipient.address);
        if (r.ok) { clearUnresolved(); setDone({ link: r.link, address: r.to }); }
        else if (r.pending) {
          // If updating storage fails, the existing 'unknown' marker remains.
          if (!retainUnresolved({ hash: r.hash })) {
            unresolvedRef.current = { hash: r.hash };
            setUnresolved({ hash: r.hash });
          }
          setErr(r.error);
        } else { clearUnresolved(); setErr(r.error); }
      } catch { setErr(m("The response was lost. Do not submit again. Verify the transaction in your wallet history; its hash was not received by this browser.")); }
      finally { submitting.current = false; setTransferPhase(null); }
    });
  }

  function checkSubmitted() {
    const hash = unresolvedRef.current?.hash;
    if (!hash || submitting.current || isLocalPreview) return;
    submitting.current = true;
    setTransferPhase("check");
    start(async () => {
      try {
        const result = await checkSubmittedTransfer(hash);
        if (result.ok) {
          clearUnresolved();
          setDone({ link: result.link, hash, statusOnly: true });
          setErr("");
        } else if (result.pending) setErr(result.error);
        else { clearUnresolved(); setRecipient(null); setErr(result.error); }
      } catch { setErr(m("The status check is unavailable. The original transaction remains unresolved; do not submit again.")); }
      finally { submitting.current = false; setTransferPhase(null); }
    });
  }

  return (
    <div className={styles.screen}>
      <AppBar leading={transferPhase ? undefined : <IconButton ariaLabel={m("Back")} onClick={() => recipient && !done && !unresolved ? setRecipient(null) : goBack()}>{Ico.back({})}</IconButton>} title={transferPhase ? m("Waiting for network confirmation") : done ? m("Transfer receipt") : unresolved ? m("Check submitted transaction") : recipient ? m("Review transfer") : t("send.title")} trailing={transferPhase ? undefined : <IconButton ariaLabel={m("Receive")} onClick={() => router.push("/receive")}>{Ico.qr({})}</IconButton>} />
      <div className={styles.content}>
        <section className={styles.intro} aria-labelledby="send-heading">
          <div>
            <span className={styles.eyebrow}>{isLocalPreview ? m("LOCAL PREVIEW") : m("STELLAR TESTNET")}</span>
            <h1 id="send-heading">{transferPhase ? (transferPhase === "check" ? m("Checking the original transaction…") : isLocalPreview ? m("LOCAL PREVIEW") : m("Sending Testnet XLM…")) : done ? (isLocalPreview ? m("Demo complete.") : done.statusOnly ? m("Transaction confirmed.") : m("Sent with a receipt.")) : unresolved ? m("Confirmation pending.") : recipient ? m("One last look.") : m("Send by name.")}</h1>
            <p>{transferPhase ? (transferPhase === "check" ? m("This is a read-only check. No new transfer is being submitted.") : m("Keep this page open. Do not send again while this transfer is being checked.")) : done ? (isLocalPreview ? m("This local demonstration did not move any tokens.") : m("Open the transaction receipt to verify its details.")) : unresolved ? m("Check the original transaction. A new transfer is blocked while its outcome is unknown.") : m("A familiar @username. A clear amount. A public receipt.")}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.doodle} src="/illustrations/send.png" alt="" width={102} height={102} />
        </section>
        {transferPhase ? <TransferMotion title={transferPhase === "check" ? m("Checking the original transaction…") : isLocalPreview ? m("LOCAL PREVIEW") : m("Waiting for network confirmation")} description={transferPhase === "check" ? m("This is a read-only check. No new transfer is being submitted.") : isLocalPreview ? m("No tokens moved. This is a local demonstration.") : m("Keep this page open. Do not send again while this transfer is being checked.")} /> : done ? <>
          <SuccessMotion variant="transfer" title={isLocalPreview ? m("Local transfer demo complete") : m("Testnet transfer confirmed")}><p>{isLocalPreview ? m("No tokens moved. This is a local demonstration.") : m("Verify the transaction details using the receipt below.")}</p></SuccessMotion>
          <article className={`${styles.ticket} ${styles.receipt}`} aria-label={m("Transfer receipt details")}>
            {done.statusOnly ? <>
              <p>{m("Stellar Testnet reports that the saved transaction succeeded. Check its public receipt for the sender, recipient and amount. No new transfer was submitted by this check.")}</p>
              <dl className={styles.details}><div className={styles.addressRow}><dt>{m("Transaction hash")}</dt><dd className={styles.address}>{done.hash}</dd></div></dl>
            </> : <>
            <div className={styles.recipientSummary}>
              <Avatar name={clean} size={42} />
              <div><span>{m("To")}</span><strong>@{clean}</strong></div>
              <span className={styles.receiptMark} aria-hidden="true">{Ico.check({ c: T.moneyIn, size: 24 })}</span>
            </div>
            <div className={styles.receiptAmount}>{formatLocalAmount(Number(amount), currency)}</div>
            <p className={styles.nativeUnit}>{xlm} {m("Testnet XLM · illustrative display value")}</p>
            <dl className={styles.details}>
              <div><dt>{m("Network")}</dt><dd>Stellar Testnet</dd></div>
              {done.address ? <div className={styles.addressRow}><dt>{m("Recipient wallet")}</dt><dd className={styles.address}>{done.address}</dd></div> : null}
            </dl>
            </>}
            {done.link ? <a className={styles.explorerLink} href={done.link} target="_blank" rel="noopener noreferrer">{m("View transaction on Stellar ↗")}</a> : null}
          </article>
          <div className={styles.actions}>
            <Btn kind="primary" onClick={() => { setDone(null); setRecipient(null); setAmount(""); setTo(""); setErr(""); }}>{m("Send again")}</Btn>
            {isLocalPreview && done.localReceiptSaved ? <Btn kind="ghost" size="md" onClick={() => router.push("/activity")}>{m("View local Activity")}</Btn> : null}
            {!isLocalPreview ? <Btn kind="ghost" size="md" onClick={() => router.push("/activity")}>{m("View Activity")}</Btn> : null}
            <Btn kind="ghost" size="md" onClick={() => router.push("/")}>{m("Back to Home")}</Btn>
          </div>
        </> : unresolved ? <>
          <article className={styles.ticket} aria-label={m("Unresolved Testnet submission")}>
            <p role="status">{unresolved.hash ? m("This signed transaction may already have been accepted. Check only this hash; do not send it again.") : m("This browser did not receive a transaction hash. Do not send again until the original attempt has been verified in your wallet history.")}</p>
            {unresolved.hash ? <>
              <dl className={styles.details}><div className={styles.addressRow}><dt>{m("Transaction hash")}</dt><dd className={styles.address}>{unresolved.hash}</dd></div></dl>
              <a className={styles.explorerLink} href={`https://stellar.expert/explorer/testnet/tx/${unresolved.hash}`} target="_blank" rel="noopener noreferrer">{m("View submitted transaction ↗")}</a>
            </> : null}
          </article>
          <div className={styles.actions}>
            {unresolved.hash ? <Btn kind="primary" disabled={pending} loading={pending} onClick={checkSubmitted}>{m("Check submitted transaction")}</Btn> : null}
            <Btn kind="ghost" size="md" onClick={() => router.push("/activity")}>{m("Open wallet history")}</Btn>
          </div>
          <p className={styles.notice}>{m("Only a confirmed failure unlocks another attempt. This session stores an unresolved hash or status marker, never payment or identity credentials.")}</p>
        </> : recipient ? <>
          <article className={styles.reviewTicket} aria-label={m("Transfer review details")}>
            <div className={styles.reviewSummary}>
              <div className={styles.summaryHeading}><span>{m("Display amount")}</span><span className={styles.summaryTag}>Testnet</span></div>
              <strong className={styles.summaryAmount}>{formatLocalAmount(Number(amount), currency)}</strong>
              <p className={styles.summaryNative}><span>{m("Token amount")}</span>{xlm} Testnet XLM</p>
              <div className={styles.transferBridge}>
                <div className={styles.transferParty}>
                  {mine ? <Avatar name={mine} size={30} /> : null}
                  <div><span>{m("From")}</span><strong>{mine ? `@${mine}` : m("Your account")}</strong></div>
                </div>
                <span className={styles.bridgeArrow} aria-hidden="true">{Ico.chev({ c: "#BED4F5", size: 18 })}</span>
                <div className={styles.transferParty}>
                  <Avatar name={recipient.username} size={30} />
                  <div><span>{isLocalPreview ? m("Example recipient") : m("Registry recipient")}</span><strong>@{recipient.username}</strong></div>
                </div>
              </div>
            </div>
            <div className={styles.reviewTear} aria-hidden="true"><span /></div>
            <div className={styles.reviewEvidence}>
              <dl>
                <div className={styles.reviewNetwork}><dt>{m("Network")}</dt><dd><span aria-hidden="true" />Stellar Testnet</dd></div>
                <div className={styles.reviewWallet}><dt>{m("Recipient wallet")}</dt><dd>{recipient.address}</dd></div>
              </dl>
              <p>{isLocalPreview ? m("This recipient is an example. Confirming shows a local receipt only.") : m("Check the username and wallet with your recipient. Network fees may apply.")}</p>
            </div>
          </article>
          <div className={styles.actions}>
            <Btn kind="primary" disabled={pending || !valid} loading={pending} onClick={doSend}>{isLocalPreview ? m("Confirm local demo") : m("Confirm Testnet transfer")}</Btn>
            <Btn kind="ghost" size="md" disabled={pending} onClick={() => setRecipient(null)}>{m("Edit transfer")}</Btn>
          </div>
          <p className={styles.notice}>{m("Currency figures use an illustrative rate. Testnet XLM has no monetary value.")}</p>
        </> : <>
          <section className={styles.composer} aria-label={m("Transfer details")}>
            <label className={styles.fieldLabel} htmlFor="send-amount">{m("Amount ·")} {CURRENCY[currency].code}</label>
            <input className={styles.amountInput} id="send-amount" aria-describedby="send-unit" value={amount} maxLength={64} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            <p id="send-unit" className={styles.nativeUnit}>{xlm} {m("Testnet XLM · illustrative rate")}</p>
            <div className={styles.presets} aria-label={m("Quick amounts")}>
              {QUICK[currency].map(q => <button className={styles.preset} key={q} type="button" aria-pressed={amount === q} onClick={() => setAmount(q)}>{formatLocalAmount(Number(q), currency)}</button>)}
            </div>
            <div className={styles.recipientField}>
              <label className={styles.fieldLabel} htmlFor="send-recipient">{m("Recipient @username")}</label>
              <div className={styles.usernameInput}>
                <span aria-hidden="true">@</span>
                <input id="send-recipient" value={to} onChange={e => setTo(e.target.value.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32))} placeholder={m("e.g. jamamam")} autoCapitalize="none" autoComplete="off" />
              </div>
              {self ? <p role="alert" className={styles.inlineError}>{m("Choose a different recipient. You cannot send to yourself.")}</p> : null}
            </div>
            {mine ? <p className={styles.sender}><span>{m("Your username")}</span><strong>@{mine}</strong></p> : <div className={styles.claim}>
              <label className={styles.fieldLabel} htmlFor="send-claim">{m("Your username")}</label>
              <div><input className={styles.claimInput} id="send-claim" aria-label={m("Choose your username")} value={claim} onChange={e => setClaim(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0,32))} placeholder={m("your_username")} /><Btn kind="secondary" size="md" full={false} disabled={pending || claim.length < 3} onClick={doClaim}>{m("Claim")}</Btn></div>
            </div>}
          </section>
          {!withinAmountLimit ? <p role="alert" className={styles.inlineError}>{m("The amount exceeds the supported safety limit.")}</p> : null}
          <div className={styles.actions}><Btn kind="primary" disabled={pending || !valid} loading={pending} trailing={Ico.chev({ c: "#fff" })} onClick={reviewTransfer}>{m("Review transfer")}</Btn></div>
          <p className={styles.notice}>{m("Send valueless Testnet XLM. Review the amount and username before confirming.")}</p>
        </>}
        {err ? <p role="alert" className={styles.error}>{moneyMessage(locale, err)}</p> : null}
        <footer className={styles.footer}><PoweredByStellar /></footer>
      </div>
    </div>
  );
}
