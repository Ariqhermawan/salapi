"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { walletHistoryAddress } from "@/app/actions";
import { Ico, IconButton, T, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { useT } from "@/components/I18nProvider";
import { moneyCopy, moneyMessage } from "@/lib/i18n/revamp-money";
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

export default function ActivityScreen() {
  const goBack = useGoBack("/");
  const { currency, locale } = useT();
  const m = moneyCopy(locale);
  const [tab, setTab] = useState<Tab>("personal");
  const [address, setAddress] = useState<string | null>(
    isLocalPreview ? PREVIEW_WALLET.address : null,
  );
  const [loading, setLoading] = useState(!isLocalPreview);
  const [error, setError] = useState("");
  const [transfers, setTransfers] = useState<PreviewTransfer[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (isLocalPreview) {
      setTransfers(listPreviewTransfers());
      return;
    }
    setLoading(true);
    setError("");
    try {
      const wallet = await walletHistoryAddress();
      setAddress(
        wallet.address && /^G[A-Z2-7]{55}$/.test(wallet.address)
          ? wallet.address
          : null,
      );
    } catch {
      setError(
        "Your saved wallet could not be identified. Try again to open its explorer history.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(initialLoad);
  }, [refresh]);
  const shortAddress = address
    ? `${address.slice(0, 6)}…${address.slice(-6)}`
    : loading
      ? m("Loading wallet…")
      : m("No saved wallet");
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
                  : m("Sign in to view history")}
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
          !loading && (
            <Link
              className={styles.walletExplorer}
              href="/signin?next=%2Factivity"
            >
              {m("Sign in")} {Ico.chev({ size: 13, c: "#bdd8ff" })}
            </Link>
          )
        )}
      </section>
      {error && (
        <div className={styles.error} role="alert">
          {moneyMessage(locale, error)}
          <button type="button" onClick={() => void refresh()}>
            {m("Try again")}
          </button>
        </div>
      )}
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
          {isLocalPreview && transfers.length > 0 ? (
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
