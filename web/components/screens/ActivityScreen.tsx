"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { walletActivity } from "@/app/actions";
import { activityUsdcEquivalent, type WalletActivityIdentity, type WalletActivityItem } from "@/lib/wallet-activity";
import AccountAvatar from "@/components/AccountAvatar";
import { useMarketPrices } from "@/components/MarketPricesProvider";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { supabaseConfigured } from "@/lib/supabase/env";
import { Ico, IconButton, T, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
import { activityCopy } from "@/lib/i18n/wallet-activity";
import { formatLocal } from "@/lib/ui/currency";
import { isLocalPreview, PREVIEW_WALLET } from "@/lib/local-preview";
import {
  listPreviewTransfers,
  type PreviewTransfer,
} from "@/lib/local-preview-history";
import styles from "./ActivityRevamp.module.css";

const EXPLORER = "https://stellar.expert/explorer/testnet";
type Tab = "personal" | "proof";
const tabs = [
  { id: "personal", label: "My activity" },
  { id: "proof", label: "Public proof" },
] as const;

// Historical project evidence. These are never inserted into personal history.
const TRAIL = [
  {
    title: "Deploy disaster vault",
    detail: "A test contract deployed on Stellar Testnet.",
    method: "Deploy disaster vault",
    hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12",
    icon: "deploy",
  },
  {
    title: "Register @juandelacruz",
    detail: "A human-readable username registered.",
    method: "Register @juandelacruz",
    hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913",
    icon: "register",
  },
  {
    title: "Initialize the vault",
    detail: "Initial contract configuration.",
    method: "Initialize(admin, token)",
    hash: "f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1",
    icon: "deploy",
  },
  {
    title: "Contribute 5 XLM",
    detail: "Testnet funds contributed to the project pool.",
    method: "Contribute 5 XLM",
    hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66",
    icon: "fund",
  },
  {
    title: "Set disaster mode",
    detail: "Disaster mode enabled for the test deployment.",
    method: "set_disaster(true)",
    hash: "7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a",
    icon: "mode",
  },
  {
    title: "Disburse 2 XLM",
    detail: "Testnet funds released from the pool.",
    method: "Disburse 2 XLM",
    hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837",
    icon: "payout",
  },
] as const;
const highlights = [TRAIL[0], TRAIL[1], TRAIL[3], TRAIL[5]];

function FolderIcon() {
  return (
    <svg
      aria-hidden="true"
      width="29"
      height="29"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7V5.5A1.5 1.5 0 0 1 4.5 4H9l2 2h8.5A1.5 1.5 0 0 1 21 7.5V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
      <path d="M3 9h18" />
    </svg>
  );
}
function InformationIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="#2563eb"
      strokeWidth="1.7"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6" r=".6" fill="#2563eb" stroke="none" />
    </svg>
  );
}
function TrailIcon({ name }: { name: (typeof TRAIL)[number]["icon"] }) {
  if (name === "register") return <span className={styles.atSymbol}>@</span>;
  if (name === "fund") return Ico.plus({ size: 18, c: T.action });
  if (name === "payout") return Ico.arrowUp({ size: 18, c: T.action });
  if (name === "mode") return Ico.bell({ size: 18, c: T.action });
  return (
    <svg
      aria-hidden="true"
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-12-2 14" />
    </svg>
  );
}
function nativeAmount(stroops: string) {
  const units = BigInt(stroops);
  return `${units / 10_000_000n}.${String(units % 10_000_000n).padStart(7, "0")}`;
}
function receiptDate(iso: string, full = false, locale = "en") {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    ...(full ? { year: "numeric", timeZoneName: "short" } : {}),
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

type PersonalHistory = {
  owner: string | null;
  address: string | null;
  items: WalletActivityItem[];
  identities: WalletActivityIdentity[];
  nextCursor: string | null;
  status: "loading" | "ready" | "error";
  error: string;
};
const emptyHistory: PersonalHistory = {
  owner: null, address: null, items: [], identities: [], nextCursor: null, status: "loading", error: "",
};
const validAddress = (value: string | null) => value && /^G[A-Z2-7]{55}$/.test(value) ? value : null;
const transactionUrl = (hash: string) => /^[a-f0-9]{64}$/i.test(hash) ? `${EXPLORER}/tx/${hash}` : null;
const shortCounterparty = (address: string | null) => address && /^[GC][A-Z2-7]{55}$/.test(address)
  ? `${address.slice(0, 6)}…${address.slice(-6)}` : null;

// Keep actual amounts as integer stroops. Today's market equivalent is separate
// from the historical receipt and never becomes an actual USDC movement.
function exactNativeAmount(stroops: string) {
  return nativeAmount(stroops).replace(/\.0+$/, "").replace(/(\.\d*?[1-9])0+$/, "$1");
}

export default function ActivityScreen() {
  const goBack = useGoBack("/");
  const { currency, locale } = useT();
  const m = moneyCopy(locale);
  const h = activityCopy(locale);
  const { prices } = useMarketPrices();
  const [tab, setTab] = useState<Tab>("personal");
  const [owner, setOwner] = useState<string | null | undefined>(isLocalPreview ? null : undefined);
  const [authError, setAuthError] = useState(false);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [history, setHistory] = useState<PersonalHistory>(emptyHistory);
  const [loadingMore, setLoadingMore] = useState(false);
  const [transfers, setTransfers] = useState<PreviewTransfer[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const ownerRef = useRef<string | null | undefined>(undefined);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(false);

  const refresh = useCallback(async (cursor: string | null = null) => {
    if (isLocalPreview) {
      setTransfers(listPreviewTransfers());
      return;
    }
    const requestedOwner = ownerRef.current;
    if (!requestedOwner || inFlight.current || !mounted.current) return;
    inFlight.current = true;
    const currentRequest = ++requestId.current;
    setLoadingMore(Boolean(cursor));
    setHistory((current) => ({
      ...(!cursor || current.owner !== requestedOwner ? emptyHistory : current),
      owner: requestedOwner,
      status: cursor ? "ready" : "loading",
      error: "",
    }));
    try {
      const result = await walletActivity(cursor);
      if (!mounted.current || currentRequest !== requestId.current || ownerRef.current !== requestedOwner) return;
      if (!result.ok && result.code === "unauthenticated") {
        ownerRef.current = null;
        setOwner(null);
        setHistory(emptyHistory);
        return;
      }
      // Cookies can change before the browser Auth event arrives. Bind every
      // scoped result to the server-verified owner, not just this request's UI
      // owner. A mismatch must not show even a wallet address from that result.
      if (result.ownerId !== requestedOwner) {
        ownerRef.current = undefined;
        setOwner(undefined);
        setAuthError(true);
        setHistory(emptyHistory);
        return;
      }
      if (!result.ok) {
        setHistory((current) => ({ ...current, address: validAddress(result.address), status: "error", error: "Your Testnet history could not be loaded. Try again." }));
        return;
      }
      setHistory((current) => {
        const previous = cursor && current.owner === requestedOwner && current.address === result.address ? current.items : [];
        const items = [...previous];
        const seen = new Set(previous.map((item) => item.id));
        for (const item of result.items) {
          if (!seen.has(item.id)) { items.push(item); seen.add(item.id); }
        }
        const identities = new Map((cursor && current.address === result.address ? current.identities : []).map(identity => [identity.address, identity]));
        const participants = new Set([result.address, ...items.flatMap(item => [item.counterparty, item.fee.status === "available" ? item.fee.payer : null])]);
        const enrichment: unknown[] = Array.isArray(result.identities) ? result.identities.slice(0, 12) : [];
        for (const entry of enrichment) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
          const identity = entry as Partial<WalletActivityIdentity>;
          if (typeof identity.address !== "string" || !validAddress(identity.address) || !participants.has(identity.address)) continue;
          identities.set(identity.address, {
            address: identity.address,
            handle: typeof identity.handle === "string" && /^[a-z0-9_]{3,32}$/.test(identity.handle) ? identity.handle : null,
            photoUrl: typeof identity.photoUrl === "string" && identity.photoUrl.length <= 4096 ? identity.photoUrl : null,
          });
        }
        return { owner: requestedOwner, address: validAddress(result.address), items, identities: [...identities.values()], nextCursor: result.nextCursor, status: "ready", error: "" };
      });
    } catch {
      if (mounted.current && currentRequest === requestId.current && ownerRef.current === requestedOwner)
        setHistory((current) => ({ ...current, status: "error", error: "Your Testnet history could not be loaded. Try again." }));
    } finally {
      if (mounted.current && currentRequest === requestId.current) {
        inFlight.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (isLocalPreview) return () => { mounted.current = false; };
    let active = true;
    let authRevision = 0;
    const requests = requestId;
    const applyOwner = (nextOwner: string | null) => {
      if (!active) return;
      if (ownerRef.current !== nextOwner) {
        ++requestId.current;
        inFlight.current = false;
        ownerRef.current = nextOwner;
        setExpanded(null);
        setLoadingMore(false);
        setHistory(emptyHistory);
      }
      setAuthError(false);
      setOwner(nextOwner);
    };
    if (!supabaseConfigured()) {
      applyOwner(null);
      return () => { active = false; mounted.current = false; ++requests.current; };
    }
    const supabase = createSupabaseBrowser();
    // Synchronous callback: do not make an Auth API call inside the SDK lock.
    // Server action independently authenticates ownership before any lookup.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      ++authRevision;
      applyOwner(session?.user.id ?? null);
    });
    const initialRevision = authRevision;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active || initialRevision !== authRevision) return;
      if (error && error.name !== "AuthSessionMissingError") { setAuthError(true); return; }
      applyOwner(data.user?.id ?? null);
    }).catch(() => {
      if (active && initialRevision === authRevision) setAuthError(true);
    });
    return () => {
      active = false;
      mounted.current = false;
      ++requests.current;
      inFlight.current = false;
      subscription.unsubscribe();
    };
  }, [authAttempt]);

  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(initialLoad);
  }, [owner, refresh]);
  // A render after an Auth event never exposes the previous account's rows,
  // including the frame before the new account request has started.
  const personal = owner && history.owner === owner ? history : emptyHistory;
  const address = isLocalPreview ? PREVIEW_WALLET.address : personal.address;
  const loading = !isLocalPreview && !authError && (owner === undefined || Boolean(owner && personal.status === "loading"));
  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-6)}`
    : loading
      ? m("Loading wallet…")
      : authError || personal.status === "error" ? m("Wallet unavailable") : m("No saved wallet");
  const account = address ? `${EXPLORER}/account/${address}` : null;

  function navigateTabs(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    let next = index;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight")
      next = 1 - index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`activity-tab-${tabs[next].id}`)?.focus();
  }
  function showProof() {
    setTab("proof");
    document.getElementById("activity-tab-proof")?.focus();
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <IconButton ariaLabel={m("Back")} onClick={goBack}>{Ico.back({ size: 19, c: T.action })}</IconButton>
          <h1>{m("Activity")}</h1>
        </div>
        <p>{m("Your money, with a paper trail.")}</p>
      </header>
      <section
        className={styles.walletRow}
        aria-label={
          isLocalPreview
            ? m("Example Testnet wallet")
            : m("Your saved Testnet wallet")
        }
      >
        <span className={styles.walletIcon}>
          {Ico.sparkle({ size: 21, c: "#fff" })}
        </span>
        <div className={styles.walletIdentity}>
          <strong>{shortAddress}</strong>
          <span>
            <i />
            {isLocalPreview
              ? m("Example Testnet wallet")
              : address
                ? m("Saved Testnet wallet")
                : loading
                  ? m("Read-only lookup")
                  : authError || personal.status === "error" ? m("Read-only lookup") : owner ? m("No saved wallet") : m("Sign in to view history")}
          </span>
        </div>
        {account ? (
          <a
            className={styles.walletExplorer}
            href={account}
            target="_blank"
            rel="noopener noreferrer"
          >
            {m("Open explorer")} {Ico.link({ size: 13, c: "#bdd8ff" })}
          </a>
        ) : (
          !loading && !owner && !authError && (
            <Link
              className={styles.walletExplorer}
              href="/signin?next=%2Factivity"
            >
              {m("Sign in")} {Ico.chev({ size: 13, c: "#bdd8ff" })}
            </Link>
          )
        )}
      </section>
      <div className={styles.tabs} role="tablist" aria-label={m("Activity source")}>
        {tabs.map((item, index) => (
          <button
            key={item.id}
            id={`activity-tab-${item.id}`}
            type="button"
            className={styles.tab}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`activity-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => navigateTabs(event, index)}
          >
            {moneyMessage(locale, item.label)}
          </button>
        ))}
      </div>

      {tab === "personal" ? (
        <section
          id="activity-panel-personal"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="activity-tab-personal"
          className={styles.creamPanel}
        >
          {!isLocalPreview ? (
            <div data-personal-history-state={authError ? "auth-error" : loading ? "loading" : !owner ? "signed-out" : personal.status === "error" ? "error" : !address ? "no-wallet" : personal.items.length ? "ready" : "empty"}>
              {loading ? (
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span className={styles.loadingOrbit} aria-hidden="true">{Ico.sparkle({ size: 28, c: T.action })}</span>
                  <h2>{m("Loading your Testnet activity…")}</h2>
                  <p>{h("checking")}</p>
                </div>
              ) : authError ? (
                <div className={styles.error} role="alert">
                  <strong>{m("Your account could not be checked. Try again.")}</strong>
                  <button type="button" onClick={() => { setAuthError(false); setAuthAttempt((current) => current + 1); }}>{m("Try again")}</button>
                </div>
              ) : !owner ? (
                <div className={styles.emptyState}>
                  <h2>{m("Sign in to see your transfers.")}</h2>
                  <p>{h("signedOut")}</p>
                  <Link href="/signin?next=%2Factivity" className={styles.sendButton}>{m("Sign in")}</Link>
                </div>
              ) : (
                <>
                  <div className={styles.sectionHeading}>
                    <div>
                      <h2>{m("Your Testnet transfers")}</h2>
                      <p>{h("confirmed")}</p>
                    </div>
                    <button type="button" className={styles.refresh} disabled={loadingMore} aria-label={m("Refresh activity")} onClick={() => void refresh()}>
                      {Ico.refresh({ size: 18, c: T.action })}
                    </button>
                  </div>
                  {personal.items.length ? <p className={styles.identityNote}>{h("identityScope")}</p> : null}
                  {personal.items.some(item => item.asset.code === "XLM") ? <p className={styles.marketNote}>
                    {h("equivalentScope")} {h("attribution")} <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">CoinGecko</a>.
                  </p> : null}
                  {personal.error ? (
                    <div className={styles.error} role="alert">
                      {moneyMessage(locale, personal.error)}
                      <button type="button" disabled={loadingMore} onClick={() => void refresh()}>{m("Try again")}</button>
                    </div>
                  ) : null}
                  {personal.status === "ready" && !address ? (
                    <div className={styles.emptyState}>
                      <h2>{m("No saved wallet yet.")}</h2>
                      <p>{m("Open your account to set up your Testnet wallet. History is shown only for your saved address.")}</p>
                      <Link href="/settings" className={styles.sendButton}>{m("Open your account")}</Link>
                    </div>
                  ) : personal.status === "ready" && !personal.items.length ? (
                    <div className={styles.emptyState}>
                      <h2>{personal.nextCursor ? h("emptyPage") : h("empty")}</h2>
                      <p>{personal.nextCursor ? m("Other on-chain activity was found. Load earlier transfers to check older records.") : m("A new transfer may take a moment to be indexed. Refresh to check again, or open your wallet in the explorer.")}</p>
                    </div>
                  ) : null}
                  {personal.items.length ? (
                    <ol className={`${styles.timeline} ${styles.personalTimeline}`} aria-label={m("Confirmed wallet transfers")}>
                      {personal.items.map((receipt) => {
                        const received = receipt.direction === "received";
                        const counterparty = shortCounterparty(receipt.counterparty);
                        const explorerReceipt = transactionUrl(receipt.hash);
                        const identityFor = (wallet: string | null) => personal.identities.find(identity => identity.address === wallet);
                        const nameFor = (wallet: string | null) => {
                          const handle = identityFor(wallet)?.handle;
                          return handle && /^[a-z0-9_]{3,32}$/.test(handle) ? `@${handle}` : wallet === address ? h("you") : h("wallet");
                        };
                        const counterpartIdentity = identityFor(receipt.counterparty);
                        const equivalent = activityUsdcEquivalent(receipt.amountStroops, receipt.asset, prices);
                        const sender = received ? receipt.counterparty : address;
                        const recipient = received ? address : receipt.counterparty;
                        const participant = (wallet: string | null) => <span className={styles.participant}>
                          <AccountAvatar name={nameFor(wallet).replace(/^@/, "")} photoUrl={identityFor(wallet)?.photoUrl ?? null} size={32} alt={h("photo", { name: nameFor(wallet) })} />
                          <span><strong>{nameFor(wallet)}</strong><span className={styles.address}>{wallet ?? h("wallet")}</span></span>
                        </span>;
                        return (
                          <li key={receipt.id} className={styles.timelineItem}>
                            <span className={`${styles.timelineIcon} ${received ? styles.incomingIcon : ""}`} aria-hidden="true">
                              {received ? Ico.arrowDown({ size: 19, c: "#00866a" }) : Ico.arrowUp({ size: 19, c: T.action })}
                            </span>
                            <div className={styles.receiptBody}>
                              <button type="button" className={styles.receiptButton} aria-expanded={expanded === receipt.id} aria-controls={`activity-receipt-${receipt.id}`} onClick={() => setExpanded((current) => current === receipt.id ? null : receipt.id)}>
                                <div>
                                  <strong>{h(received ? "received" : "sent", { asset: receipt.asset.code })}</strong>
                                  {counterparty ? <span className={styles.counterparty}>
                                    <AccountAvatar name={nameFor(receipt.counterparty).replace(/^@/, "")} photoUrl={counterpartIdentity?.photoUrl ?? null} size={28} alt={h("photo", { name: nameFor(receipt.counterparty) })} />
                                    <span><strong>{h(received ? "from" : "to", { name: nameFor(receipt.counterparty) })}</strong><span>{counterparty}</span></span>
                                  </span> : <span>{m("On-chain wallet activity")}</span>}
                                  <time dateTime={receipt.createdAt}>{receiptDate(receipt.createdAt, false, locale)}</time>
                                </div>
                                <div className={`${styles.receiptAmount} ${received ? styles.incomingAmount : ""}`}>
                                  <strong>{received ? "+" : "−"}{exactNativeAmount(receipt.amountStroops)}</strong>
                                  <small>Testnet {receipt.asset.code}</small>
                                  {receipt.asset.code === "XLM" ? <span className={styles.equivalent} data-activity-equivalent={equivalent?.status ?? "unavailable"}>
                                    {equivalent ? <>{h("equivalent")}: ≈ {new Intl.NumberFormat(locale, { maximumSignificantDigits: 8 }).format(equivalent.amount)} USDC<br /><small>{h(equivalent.status === "stale" ? "quoteStale" : "quoteFresh", { time: receiptDate(new Date(equivalent.updatedAt * 1000).toISOString(), false, locale) })}</small></> : h("quoteUnavailable")}
                                  </span> : null}
                                </div>
                              </button>
                              <p className={styles.feeSummary}>
                                {receipt.fee.status === "available" ? <>{h("fee")}: {exactNativeAmount(receipt.fee.amountStroops)} XLM · {h(receipt.fee.paidByWallet ? "paidByYou" : "paidByOther")} {nameFor(receipt.fee.payer)}</> : h("feeUnavailable")}
                              </p>
                              {expanded === receipt.id ? (
                                <div id={`activity-receipt-${receipt.id}`} className={styles.receiptDetails}>
                                  <dl>
                                    <dt>{h("amount")}</dt><dd>{nativeAmount(receipt.amountStroops)} Testnet {receipt.asset.code}</dd>
                                    <dt>{h("units")}</dt><dd>{receipt.amountStroops} units</dd>
                                    {receipt.asset.issuer ? <><dt>{h("issuer")}</dt><dd className={styles.address}>{receipt.asset.issuer}</dd><dt>{h("contract")}</dt><dd className={styles.address}>{receipt.asset.contractId}</dd></> : null}
                                    <dt>{m("Recorded at")}</dt><dd>{receiptDate(receipt.createdAt, true, locale)}</dd>
                                    <dt>{h("sender")}</dt><dd>{participant(sender)}</dd>
                                    <dt>{h("recipient")}</dt><dd>{participant(recipient)}</dd>
                                    <dt>{m("Transaction hash")}</dt><dd className={styles.address}>{receipt.hash}</dd>
                                    {receipt.fee.status === "available" ? <>
                                      <dt>{h("fee")}</dt><dd>{exactNativeAmount(receipt.fee.amountStroops)} Testnet XLM</dd>
                                      <dt>{h("feePayer")}</dt><dd>{participant(receipt.fee.payer)}{h(receipt.fee.paidByWallet ? "paidByYou" : "paidByOther")}</dd>
                                    </> : null}
                                  </dl>
                                  <p>{receipt.fee.status === "available" ? h("feeScope") : h("feeMissing")}</p>
                                  {receipt.fee.status === "available" && receipt.fee.feeBump ? <p>{h("feeBump")}</p> : null}
                                  {receipt.fee.status === "available" && receipt.fee.transactionHash !== receipt.hash && transactionUrl(receipt.fee.transactionHash) ? <a className={styles.transactionLink} href={transactionUrl(receipt.fee.transactionHash)!} target="_blank" rel="noopener noreferrer">{h("feeReceipt")}</a> : null}
                                  {explorerReceipt ? <a className={styles.transactionLink} href={explorerReceipt} target="_blank" rel="noopener noreferrer">{m("View transaction on Stellar ↗")}</a> : null}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  ) : null}
                  {personal.nextCursor ? (
                    <button type="button" className={styles.loadMore} disabled={loadingMore} aria-busy={loadingMore} onClick={() => void refresh(personal.nextCursor)}>
                      {loadingMore ? m("Loading more activity…") : m("Load earlier transfers")}
                    </button>
                  ) : null}
                  {address ? <Link href="/send" className={styles.sendButton}>{Ico.send({ size: 18, c: "#fff" })} {m("Send by @")}</Link> : null}
                </>
              )}
            </div>
          ) : transfers.length > 0 ? (
            <>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>{m("Recorded in this browser.")}</h2>
                  <p>{m("Local demos only. No tokens moved.")}</p>
                </div>
                <button
                  type="button"
                  className={styles.refresh}
                  aria-label={m("Refresh local activity")}
                  onClick={() => void refresh()}
                >
                  {Ico.refresh({ size: 15, c: T.action })}
                </button>
              </div>
              <ol className={styles.timeline}>
                {transfers.map((receipt) => (
                  <li key={receipt.id} className={styles.timelineItem}>
                    <span className={styles.timelineIcon}>
                      {Ico.arrowUp({ size: 17, c: T.action })}
                    </span>
                    <div className={styles.receiptBody}>
                      <button
                        type="button"
                        className={styles.receiptButton}
                        aria-expanded={expanded === receipt.id}
                        aria-controls={`activity-receipt-${receipt.id}`}
                        onClick={() =>
                          setExpanded((current) =>
                            current === receipt.id ? null : receipt.id,
                          )
                        }
                      >
                        <div>
                          <strong>
                            {m("Send demo to @")}{receipt.recipientHandle}
                          </strong>
                          <span>{receiptDate(receipt.createdAt, false, locale)}</span>
                        </div>
                        <div className={styles.receiptAmount}>
                          <strong>
                            {formatLocal(receipt.pesos, currency)}
                          </strong>
                          <small>{m("Local demo")}</small>
                        </div>
                      </button>
                      {expanded === receipt.id && (
                        <div
                          id={`activity-receipt-${receipt.id}`}
                          className={styles.receiptDetails}
                        >
                          <p>
                            {m("A confirmed browser demonstration, not an on-chain transfer.")}
                          </p>
                          <dl>
                            <dt>{m("Native amount")}</dt>
                            <dd>
                              {nativeAmount(receipt.amountStroops)} Testnet XLM
                            </dd>
                            <dt>{m("Exact native units")}</dt>
                            <dd>{receipt.amountStroops} stroops</dd>
                            <dt>{m("Recorded at")}</dt>
                            <dd>{receiptDate(receipt.createdAt, true, locale)}</dd>
                            <dt>{m("Recipient wallet")}</dt>
                            <dd className={styles.address}>
                              {receipt.recipientAddress}
                            </dd>
                          </dl>
                          <p>
                            {m("No transaction hash was generated. Display currency is illustrative.")}
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <Link href="/send" className={styles.sendButton}>
                {Ico.send({ size: 18, c: "#fff" })} {m("Send by @")}
              </Link>
            </>
          ) : (
            <div className={styles.emptyState}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.doodle}
                src="/illustrations/send.png"
                alt="Salapi send-by-name illustration"
                width={142}
                height={118}
              />
              <h2>
                {isLocalPreview
                  ? m("No recorded transfers yet.")
                  : m("Your history is in the explorer.")}
              </h2>
              <p>
                {isLocalPreview
                  ? m("Confirm a Send demo to record it here. Local examples do not move tokens or appear on-chain.")
                  : m("Personal transactions are not loaded on this screen. Open your saved wallet in the explorer for its Testnet history.")}
              </p>
              <Link href="/send" className={styles.sendButton}>
                {Ico.send({ size: 18, c: "#fff" })} {m("Send by @")}
              </Link>
            </div>
          )}
          <button
            type="button"
            className={styles.proofTeaser}
            onClick={showProof}
          >
            <FolderIcon />
            <span>
              <strong>{m("Salapi public proof")}</strong>
              <small>{m("Project receipts, not your transactions.")}</small>
              <b>{m("View project archive")} {Ico.chev({ size: 12, c: T.action })}</b>
            </span>
            {Ico.chev({ size: 16, c: "#617a9e" })}
          </button>
        </section>
      ) : (
        <section
          id="activity-panel-proof"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby="activity-tab-proof"
          className={`${styles.creamPanel} ${styles.proofPanel}`}
        >
          <header className={styles.proofHeader}>
            <FolderIcon />
            <div>
              <h2>{m("Salapi public proof")}</h2>
              <p>{m("Project receipts, not your transactions.")}</p>
            </div>
          </header>
          <ol className={`${styles.timeline} ${styles.archiveTimeline}`}>
            {highlights.map((row) => (
              <li key={row.hash} className={styles.timelineItem}>
                <span className={styles.timelineIcon}>
                  <TrailIcon name={row.icon} />
                </span>
                <a
                  className={styles.archiveRow}
                  href={`${EXPLORER}/tx/${row.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{moneyMessage(locale, row.title)}</strong>
                  <p>{moneyMessage(locale, row.detail)}</p>
                  <span>
                    {m("Week 2 archive")} {Ico.link({ size: 11, c: T.action })}
                  </span>
                </a>
              </li>
            ))}
          </ol>
          <div className={styles.archiveNote}>
            <InformationIcon />
            <p>
              {m("These historical receipts document an earlier Testnet deployment. They are not personal transactions or the current D3/D4 operational state.")}
            </p>
          </div>
          <details className={styles.technicalDetails}>
            <summary>
              {m("Technical details · all 6 receipts")}{" "}
              {Ico.chev({ size: 14, c: T.action })}
            </summary>
            <ol>
              {TRAIL.map((row) => (
                <li key={row.hash}>
                  <a
                    href={`${EXPLORER}/tx/${row.hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>{moneyMessage(locale, row.method)}</strong>
                    <code>{row.hash}</code>
                    <span>
                      {m("Open archived transaction")}{" "}
                      {Ico.link({ size: 11, c: T.action })}
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </details>
          <Link href="/docs" className={styles.projectDocs}>
            {m("View project documentation")} {Ico.chev({ size: 13, c: T.action })}
          </Link>
        </section>
      )}
      <footer className={styles.footer}>
        <PoweredByStellar />
      </footer>
    </div>
  );
}
