"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppBar, Btn, Ico, IconButton } from "@/components/ui/kit";
import { xlmToStroopsExact } from "@/lib/money";
import { PREVIEW_RECIPIENT, PREVIEW_WALLET } from "@/lib/local-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import { cancelWalletWithdrawal, confirmWalletWithdrawal, prepareWalletWithdrawal, walletWithdrawalState } from "@/app/withdraw-actions";
import styles from "./PrototypeWithdrawScreen.module.css";

type Currency = "IDR" | "PHP" | "XLM";
type WalletState = Awaited<ReturnType<typeof walletWithdrawalState>>;
type PreparedWithdrawal = Extract<Awaited<ReturnType<typeof prepareWalletWithdrawal>>, { ok: true }>;
type Receipt = Awaited<ReturnType<typeof confirmWalletWithdrawal>>
  | { ok: true; localPreview: true }
  | { ok: false; pending: true; unknown: true; error: string };

function formatXlm(stroops: bigint | string): string {
  const amount = typeof stroops === "bigint" ? stroops : BigInt(stroops);
  const whole = (amount / 10_000_000n).toLocaleString("en-US");
  const fraction = (amount % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export default function TestnetWithdrawScreen({ initialCurrency, localPreview = false }: { initialCurrency?: Currency; localPreview?: boolean }) {
  const router = useRouter();
  const goBack = useGoBack("/");
  const currency = initialCurrency ?? null;
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(true);
  const [recipientInput, setRecipientInput] = useState(localPreview ? PREVIEW_RECIPIENT : "");
  const [memo, setMemo] = useState("");
  const [memoType, setMemoType] = useState<"text" | "id">("text");
  const [amountText, setAmountText] = useState(localPreview ? "1" : "");
  const [prepared, setPrepared] = useState<PreparedWithdrawal | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState<"prepare" | "confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localPreview) {
      const balance = xlmToStroopsExact(PREVIEW_WALLET.xlm) ?? 0n;
      const fee = 100n;
      setWallet({ ok: true, address: PREVIEW_WALLET.address, balanceStroops: balance.toString(),
        withdrawableStroops: (balance > 10_000_000n + fee ? balance - 10_000_000n - fee : 0n).toString(), feeStroops: fee.toString() });
      setLoadingWallet(false);
      return;
    }
    let active = true;
    walletWithdrawalState().then(result => {
      if (active) setWallet(result);
    }).catch(() => {
      if (active) setWallet({ ok: false, error: "Your Testnet wallet could not be loaded. Try again later." });
    }).finally(() => {
      if (active) setLoadingWallet(false);
    });
    return () => { active = false; };
  }, [localPreview]);

  const choose = (next: Currency) => router.replace(`/withdraw?cur=${next.toLowerCase()}`);
  const recipient = recipientInput.trim().toUpperCase();
  const recipientOk = /^G[A-Z2-7]{55}$/.test(recipient);
  const amountStroops = xlmToStroopsExact(amountText);
  const spendable = wallet?.ok ? BigInt(wallet.withdrawableStroops) : 0n;
  const amountOk = amountStroops !== null && amountStroops > 0n && amountStroops <= spendable;
  const memoValue = memo.trim();
  const memoBytes = typeof TextEncoder === "undefined" ? memoValue.length : new TextEncoder().encode(memoValue).length;
  const memoOk = !memoValue || (memoType === "text"
    ? memoBytes <= 28
    : /^(?:0|[1-9]\d{0,19})$/.test(memoValue) && BigInt(memoValue) <= 18_446_744_073_709_551_615n);

  const setPreset = (percent: 25 | 50 | 75 | 100) => {
    const next = spendable * BigInt(percent) / 100n;
    setAmountText(formatXlm(next));
  };

  const prepare = async () => {
    if (!amountOk || !recipientOk || !memoOk) return;
    setBusy("prepare");
    setError(null);
    if (localPreview) {
      setPrepared({ ok: true, intentId: "local-preview", sender: PREVIEW_WALLET.address, recipient,
        amountStroops: amountStroops!.toString(), feeStroops: "100", expiresAt: new Date(Date.now() + 120_000).toISOString() });
      setBusy(null);
      return;
    }
    try {
      const result = await prepareWalletWithdrawal({ recipient, amountXlm: amountText.trim(), memoType, memo: memoValue });
      if (!result.ok) { setError(result.error); return; }
      setPrepared(result);
    } catch {
      setError("Testnet could not prepare this withdrawal. Nothing was sent; try again later.");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async () => {
    if (!prepared) return;
    if (localPreview) {
      setReceipt({ ok: true, localPreview: true });
      setPrepared(null);
      return;
    }
    setBusy("confirm");
    setError(null);
    try {
      const result = await confirmWalletWithdrawal(prepared.intentId);
      setReceipt(result);
    } catch {
      // The request may have reached the server. Never offer a fresh transfer
      // when the client cannot tell whether the first transaction was sent.
      setReceipt({ ok: false, pending: true, unknown: true,
        error: "The confirmation response was interrupted. Don’t submit again; check wallet activity for the Testnet transfer." });
    } finally {
      setBusy(null);
      setPrepared(null);
    }
  };

  const cancel = async () => {
    if (!prepared) return;
    setBusy("cancel");
    try { await cancelWalletWithdrawal(prepared.intentId); } catch { /* The review still closes locally. */ }
    finally { setPrepared(null); setBusy(null); }
  };

  const tryAgain = () => {
    setReceipt(null);
    setAmountText("");
    setError(null);
  };

  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={prepared ? cancel : goBack}>{Ico.back({})}</IconButton>} title="Withdraw" />
    {!currency ? <section className={styles.currencyChooser}>
      <h2>Choose how to withdraw</h2>
      <div role="radiogroup" aria-label="Withdrawal method">
        {([
          ["IDR", "Indonesian rupiah", "Bank payout is not connected on Testnet"],
          ["PHP", "Philippine peso", "Bank payout is not connected on Testnet"],
          ["XLM", "Stellar wallet", "Send XLM on Stellar Testnet"],
        ] as const).map(([id, name, description]) => <button key={id} type="button" role="radio" aria-checked={false} className={styles.currencyOption} onClick={() => choose(id)}>
          <img src={`/prototype-money/${id.toLowerCase()}.svg`} alt="" width="32" height="32" />
          <span><strong>{id} · {name}</strong><small>{description}</small></span><i />
        </button>)}
      </div>
    </section> : currency !== "XLM" ? <>
      <nav className={styles.currencyTabs} role="tablist" aria-label="Withdrawal currency">
        {(["IDR", "PHP", "XLM"] as const).map(id => <button key={id} type="button" role="tab" aria-selected={currency === id} onClick={() => choose(id)}>{id}</button>)}
      </nav>
      <section className={styles.done}>
        <span className={styles.badge}>ⓘ</span>
        <h1>Bank payout is not connected</h1>
        <p>Salapi can’t send funds to a bank account yet. No bank details are collected or stored here.</p>
      </section>
      <div className={styles.actions}><Btn onClick={() => choose("XLM")}>Withdraw to a Stellar wallet</Btn></div>
    </> : <>
      <nav className={styles.currencyTabs} role="tablist" aria-label="Withdrawal currency">
        {(["IDR", "PHP", "XLM"] as const).map(id => <button key={id} type="button" role="tab" aria-selected={currency === id} onClick={() => choose(id)}>{id}</button>)}
      </nav>
      {receipt ? <>
        <section className={styles.done} aria-label="Testnet withdrawal status">
          <span className={styles.badge} aria-hidden="true">{receipt.ok ? "✓" : receipt.pending ? "…" : "!"}</span>
          <h1>{receipt.ok ? ("localPreview" in receipt && receipt.localPreview ? "Preview complete" : "XLM sent") : receipt.pending ? "Withdrawal status unknown" : "Withdrawal not confirmed"}</h1>
          <p>{receipt.ok ? ("localPreview" in receipt && receipt.localPreview ? "Local preview only. No transaction was submitted and no funds moved." : "The Testnet transaction was confirmed on Stellar.") : receipt.error}</p>
          {"link" in receipt && receipt.link ? <a href={receipt.link} target="_blank" rel="noreferrer">View transaction on Stellar Expert</a> : null}
        </section>
        <div className={styles.actions}>
          <div className={styles.cta}><Btn onClick={() => router.push("/")}>Home</Btn></div>
          {!('pending' in receipt && receipt.pending) ? <Btn kind="ghost" onClick={tryAgain}>Make another withdrawal</Btn> : null}
        </div>
      </> : <>
        <div className={styles.method}>
          <span className={styles.badge}><img width="30" height="30" src="/prototype-money/xlm.svg" alt="" /></span>
          <span className={styles.methodCopy}><span className={styles.methodName}>Stellar wallet</span><span className={styles.methodNote}>{localPreview ? "Native XLM · local preview" : "Native XLM · Stellar Testnet"}</span></span>
        </div>
        <section className={styles.form} aria-label="Stellar wallet details">
          <div className={styles.field}>
            <label htmlFor="withdraw-stellar-address">Wallet address</label>
            <input id="withdraw-stellar-address" autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Starts with G, 56 characters" value={recipientInput} onChange={event => setRecipientInput(event.target.value)} aria-invalid={recipientInput.trim() !== "" && !recipientOk || undefined} />
          </div>
          {recipientInput.trim() !== "" && !recipientOk ? <p className={styles.error}>Enter a valid Stellar public address.</p> : null}
          <div className={styles.field}>
            <label htmlFor="withdraw-stellar-memo">Memo <span>(optional)</span></label>
            <input id="withdraw-stellar-memo" autoComplete="off" maxLength={28} placeholder="Only if the receiving wallet asks for one" value={memo} onChange={event => setMemo(event.target.value)} aria-invalid={!memoOk || undefined} />
          </div>
          {memoValue ? <div className={styles.presets} role="group" aria-label="Memo type">
            <button className={styles.preset} type="button" aria-pressed={memoType === "text"} onClick={() => setMemoType("text")}>Text memo</button>
            <button className={styles.preset} type="button" aria-pressed={memoType === "id"} onClick={() => setMemoType("id")}>Numeric ID</button>
          </div> : null}
          {!memoOk ? <p className={styles.error}>{memoType === "text" ? "The memo must be 28 bytes or fewer." : "Enter a valid numeric Stellar memo ID."}</p> : null}
          <p className={styles.hint}><span aria-hidden="true">ⓘ</span>Only send XLM to an active Testnet wallet. Choose the memo format requested by the recipient; confirmed transactions can’t be reversed.</p>
        </section>
        <section className={styles.amount} data-disabled={!recipientOk || loadingWallet} aria-label="Withdrawal amount">
          <label htmlFor="withdraw-stellar-amount" className={styles.amountLabel}>
            {loadingWallet ? "Checking Testnet balance…" : wallet?.ok ? `Amount · XLM · ${formatXlm(spendable)} available` : "Testnet wallet balance unavailable"}
          </label>
          <input id="withdraw-stellar-amount" className={styles.amountInput} inputMode="decimal" value={amountText} onChange={event => setAmountText(event.target.value)} placeholder="0" disabled={!recipientOk || loadingWallet || !wallet?.ok} aria-invalid={amountText !== "" && !amountOk || undefined} />
          <div className={styles.presets} aria-label="Withdrawal amounts">
            {([25, 50, 75, 100] as const).map(percent => <button className={styles.preset} key={percent} type="button" disabled={!recipientOk || !wallet?.ok || spendable === 0n} onClick={() => setPreset(percent)}>{percent === 100 ? "Max" : `${percent}%`}</button>)}
          </div>
          {wallet?.ok ? <p className={styles.hint}>Wallet balance: {formatXlm(wallet.balanceStroops)} XLM. The estimate keeps 1 XLM in reserve and includes the current network fee.</p> : null}
          {amountText !== "" && amountStroops === null ? <p className={styles.error}>Enter an amount with up to 7 decimal places.</p> : amountText !== "" && amountStroops !== null && amountStroops > spendable ? <p className={styles.error}>That amount is above the available balance.</p> : null}
        </section>
        {loadingWallet ? <p className={styles.instruction}>Reading your signed-in Testnet wallet.</p> : wallet && !wallet.ok ? <p className={styles.instruction} role="status">{wallet.error}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <div className={styles.cta}><Btn disabled={!recipientOk || !amountOk || !memoOk || !wallet?.ok} loading={busy === "prepare"} onClick={prepare}>Review withdrawal</Btn></div>
      </>}
    </>}
    {prepared ? <div className={styles.backdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) void cancel(); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="withdraw-review-title">
        <div className={styles.handle} aria-hidden="true" />
        <h2 id="withdraw-review-title">Review Testnet withdrawal</h2>
        <div className={styles.row}><span>To</span><strong>{prepared.recipient}</strong></div>
        <div className={styles.row}><span>Network</span><strong>Stellar Testnet</strong></div>
        {memo.trim() ? <div className={styles.row}><span>Memo · {memoType === "id" ? "Numeric ID" : "Text"}</span><strong>{memo.trim()}</strong></div> : null}
        <div className={styles.row}><span>Amount</span><strong>{formatXlm(prepared.amountStroops)} XLM</strong></div>
        <div className={styles.row}><span>Network fee</span><strong>{formatXlm(prepared.feeStroops)} XLM</strong></div>
        <p className={styles.sheetNote}>{localPreview ? "Local preview only. No transaction will be submitted and no funds will move." : "This sends a real Stellar Testnet transaction from your wallet. Review the destination and memo; the transfer cannot be reversed."}</p>
        <Btn loading={busy === "confirm"} onClick={confirm}>{localPreview ? "Preview withdrawal" : "Confirm withdrawal"}</Btn>
        <Btn kind="ghost" disabled={busy !== null} onClick={cancel}>Cancel</Btn>
      </section>
    </div> : null}
  </div>;
}
