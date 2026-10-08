"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerUsername, myHandle, sendByUsername, lookupRecipient, checkSubmittedTransfer } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
import { T, Ico, AppBar, IconButton, Btn, PoweredByStellar } from "@/components/ui/kit";
import AccountAvatar from "@/components/AccountAvatar";
import { useAccountPhoto } from "@/components/useAccountPhoto";
import { recipientUsername, RECIPIENT_USERNAME_PATTERN } from "@/lib/recipient-review";
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
  const [to, setTo] = useState(initialTo ?? "");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState<{ username: string; address: string } | null>(null);
  const accountPhoto = useAccountPhoto();
  const [identity, setIdentity] = useState<{ username: string; address: string; handle: string | null; photoUrl: string | null } | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const lookupVersion = useRef(0);
  const [pending, start] = useTransition();
  const [transferPhase, setTransferPhase] = useState<"send" | "check" | null>(null);
  const submitting = useRef(false);
  const [done, setDone] = useState<{ link?: string; address?: string; hash?: string; statusOnly?: boolean; localReceiptSaved?: boolean } | null>(null);
  const [err, setErr] = useState("");
  const [unresolved, setUnresolved] = useState<UnresolvedSend | null>(null);
  const unresolvedRef = useRef<UnresolvedSend | null>(null);
  const clean = recipientUsername(to);
  const units = localToStroops(amount, currency);
  const displayPesos = pesoFromLocal(Number(amount), currency);
  const withinAmountLimit = Number.isFinite(displayPesos) && displayPesos <= 1_000_000_000 && (units === null || units <= MAX_TRANSFER_STROOPS);
  const self = !!mine && clean === mine.toLowerCase();
  const validUsername = RECIPIENT_USERNAME_PATTERN.test(clean);
  const valid = validUsername && units !== null && units > 0n && !self && withinAmountLimit;
  const shownIdentity = recipient && identity?.username === recipient.username && identity.address === recipient.address ? identity : null;
  const recipientHandle = shownIdentity?.handle ?? recipient?.username ?? clean;
  const xlm = units === null ? "0" : String(units / 10_000_000n) + "." + String(units % 10_000_000n).padStart(7, "0");

  useEffect(() => {
    if (isLocalPreview) return;
    const saved = storedUnresolvedSend();
    unresolvedRef.current = saved;
    // Restore browser-only session state after hydration, never in SSR output.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUnresolved(saved);
    myHandle().then(setMine).catch(() => setErr("Your username could not be loaded. Please try again."));
    const requestVersion = lookupVersion;
    return () => { requestVersion.current++; };
  }, []);

  useEffect(() => {
    if (isLocalPreview || !recipient) return;
    let active = true;
    const controller = new AbortController();
    const query = new URLSearchParams({ username: recipient.username, address: recipient.address });
    // Optional photos never delay registry review or share the Server Action
    // queue with a send. Editing/unmounting discards late recipient responses.
    void fetch(`/api/transfers/recipient-identity?${query}`, {
      credentials: "same-origin", cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]),
    }).then(async response => {
      if (!response.ok) return;
      const result = await response.json();
      if (!active) return;
      if (result.ok === false && result.code === "changed") {
        lookupVersion.current++;
        setRecipient(null);
        setLookupError(moneyCopy(locale)("The recipient changed. Check the username again before sending."));
      } else if (result.ok === true && result.username === recipient.username && result.address === recipient.address) {
        setIdentity({ username: recipient.username, address: recipient.address,
          handle: typeof result.handle === "string" && RECIPIENT_USERNAME_PATTERN.test(result.handle) ? result.handle : null,
          photoUrl: typeof result.photoUrl === "string" ? result.photoUrl : null });
      }
    }).catch(() => { /* Optional photo failure keeps the verified wallet and initials. */ })
      .finally(() => { if (active) setPhotoLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [recipient, locale]);

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
    const request = ++lookupVersion.current;
    start(async () => {
      setErr("");
      setLookupError("");
      try {
        const r = await lookupRecipient(clean);
        if (request !== lookupVersion.current) return;
        if (r.ok) {
          if (r.address === PREVIEW_WALLET.address && isLocalPreview) { setErr(m("You cannot send to yourself.")); return; }
          setIdentity(null);
          setPhotoLoading(!isLocalPreview);
          setRecipient({ username: r.username, address: r.address });
        } else setLookupError(r.code === "not_found"
          ? m("@{username} is not registered. Check the spelling or ask the recipient for their exact username.", { username: clean })
          : r.code === "unavailable" ? m("We could not verify this username. This does not mean it is unregistered. Try again.") : moneyMessage(locale, r.error));
      } catch { if (request === lookupVersion.current) setLookupError(m("We could not verify this username. This does not mean it is unregistered. Try again.")); }
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
              <AccountAvatar name={recipientHandle} photoUrl={shownIdentity?.photoUrl ?? null} size={42} alt={`@${recipientHandle}`} />
              <div><span>{m("To")}</span><strong>@{recipientHandle}</strong></div>
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
                  <AccountAvatar name={mine ?? "?"} photoUrl={accountPhoto.profile?.photoUrl ?? null} size={38} alt={mine ? `@${mine}` : m("Your account")} />
                  <div><span>{m("From")}</span><strong>{mine ? `@${mine}` : m("Your account")}</strong></div>
                </div>
                <span className={styles.bridgeArrow} aria-hidden="true">{Ico.chev({ c: "#BED4F5", size: 18 })}</span>
                <div className={styles.transferParty}>
                  <AccountAvatar name={recipientHandle} photoUrl={shownIdentity?.photoUrl ?? null} size={38} alt={`@${recipientHandle}`} />
                  <div><span>{isLocalPreview ? m("Example recipient") : m("To")}</span><strong>@{recipientHandle}</strong>
                    {recipientHandle !== recipient.username ? <small>{m("Via alias @{username}", { username: recipient.username })}</small> : null}
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.reviewTear} aria-hidden="true"><span /></div>
            <div className={styles.reviewEvidence}>
              <p className={styles.verifiedRecipient}>{Ico.check({ c: T.moneyIn, size: 14 })}{isLocalPreview ? m("Example recipient") : m("Username registered on Stellar Testnet")}</p>
              <dl>
                <div className={styles.reviewNetwork}><dt>{m("Network")}</dt><dd><span aria-hidden="true" />Stellar Testnet</dd></div>
                <div className={styles.reviewWallet}><dt>{m("Recipient wallet")}</dt><dd>{recipient.address}</dd></div>
              </dl>
              <p>{isLocalPreview ? m("This recipient is an example. Confirming shows a local receipt only.") : m("A registered username could still be the wrong person. Match this username and wallet with your recipient before confirming.")}</p>
              {!isLocalPreview ? <details className={styles.photoNote}><summary>{m("About profile photos")}</summary><p>{photoLoading ? m("Loading the permitted account photo…") : m("Photos appear only when available and permitted by their owner. Otherwise, initials are shown. A photo is not proof of identity.")}</p></details> : null}
            </div>
          </article>
          <div className={styles.actions}>
            <Btn kind="primary" disabled={pending || !valid} loading={pending} onClick={doSend}>{isLocalPreview ? m("Confirm local demo") : m("Confirm Testnet transfer")}</Btn>
            <Btn kind="ghost" size="md" disabled={pending} onClick={() => setRecipient(null)}>{m("Edit transfer")}</Btn>
          </div>
          <p className={styles.notice}>{m("Testnet forms use fixed demo conversion, not the CoinGecko market estimate. Review the exact XLM before confirming.")}</p>
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
                <input id="send-recipient" value={to} maxLength={33} aria-describedby="send-recipient-help" aria-invalid={!!clean && !validUsername || !!lookupError}
                  onChange={e => { lookupVersion.current++; setTo(e.target.value); setLookupError(""); }}
                  placeholder={m("e.g. jamamam")} autoCapitalize="none" autoComplete="off" spellCheck={false} />
              </div>
              <p id="send-recipient-help" className={styles.recipientHelp}>{m("Use 3–32 letters, numbers or underscores. We check the exact username when you review.")}</p>
              {clean && !validUsername ? <p role="alert" className={styles.inlineError}>{m("Enter a username with 3–32 letters, numbers or underscores.")}</p> : null}
              {lookupError ? <p role="alert" className={styles.inlineError}>{lookupError}</p> : null}
              {self ? <p role="alert" className={styles.inlineError}>{m("Choose a different recipient. You cannot send to yourself.")}</p> : null}
            </div>
            {mine ? <p className={styles.sender}><span>{m("Your username")}</span><strong>@{mine}</strong></p> : <div className={styles.claim}>
              <label className={styles.fieldLabel} htmlFor="send-claim">{m("Your username")}</label>
              <div><input className={styles.claimInput} id="send-claim" aria-label={m("Choose your username")} value={claim} onChange={e => setClaim(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0,32))} placeholder={m("your_username")} /><Btn kind="secondary" size="md" full={false} disabled={pending || claim.length < 3} onClick={doClaim}>{m("Claim")}</Btn></div>
            </div>}
          </section>
          {!withinAmountLimit ? <p role="alert" className={styles.inlineError}>{m("The amount exceeds the supported safety limit.")}</p> : null}
          <div className={styles.actions}><Btn kind="primary" disabled={pending || !valid} loading={pending} trailing={Ico.chev({ c: "#fff" })} onClick={reviewTransfer}>{m("Review transfer")}</Btn></div>
          <p className={styles.notice}>{m("Send valueless Testnet XLM. Review the amount and username before confirming.")} {m("Testnet forms use fixed demo conversion, not the CoinGecko market estimate. Review the exact XLM before confirming.")}</p>
        </>}
        {err ? <p role="alert" className={styles.error}>{moneyMessage(locale, err)}</p> : null}
        <footer className={styles.footer}><PoweredByStellar /></footer>
      </div>
    </div>
  );
}
