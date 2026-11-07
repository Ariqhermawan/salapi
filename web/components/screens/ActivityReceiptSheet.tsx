"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import AccountAvatar from "@/components/AccountAvatar";
import { Ico } from "@/components/ui/icons";
import type { Locale } from "@/lib/i18n/config";
import { moneyCopy } from "@/lib/i18n/revamp-money";
import { activityCopy, activityEstimateLabel } from "@/lib/i18n/wallet-activity";
import {
  activityContextHref,
  activityStroopsToXlm,
  type activityUsdcEquivalent,
  type WalletActivityIdentity,
  type WalletActivityItem,
} from "@/lib/wallet-activity";
import styles from "./ActivityReceiptSheet.module.css";

type Props = {
  receipt: WalletActivityItem;
  address: string | null;
  identities: ReadonlyMap<string, WalletActivityIdentity>;
  locale: Locale;
  equivalent: ReturnType<typeof activityUsdcEquivalent>;
  purposeName?: string;
  campaignCover?: string | null;
  onClose: () => void;
};

const explorerUrl = (hash: string) => /^[a-f0-9]{64}$/i.test(hash)
  ? `https://stellar.expert/explorer/testnet/tx/${hash}` : null;

function CopyIcon() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.55">
    <rect x="6.5" y="6.5" width="10" height="10" rx="1.4" />
    <path d="M13.5 4H4v9.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function ActivityReceiptSheet({ receipt, address, identities, locale, equivalent, purposeName, campaignCover, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const clickedBackdrop = useRef(false);
  const titleId = useId();
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);
  const h = activityCopy(locale);
  const m = moneyCopy(locale);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = node.closest(".sl-app-frame");
    function alignToApp() {
      const bounds = frame?.getBoundingClientRect();
      if (bounds) node?.style.setProperty("--receipt-center", `${bounds.left + bounds.width / 2}px`);
    }
    alignToApp();
    window.addEventListener("resize", alignToApp);
    node.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("resize", alignToApp);
      node.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  const { asset, context, fee } = receipt;
  const received = receipt.direction === "received";
  const sender = received ? receipt.counterparty : address;
  const recipient = received ? address : receipt.counterparty;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  const stellarHref = explorerUrl(receipt.hash);
  const feeHref = fee.status === "available" && fee.transactionHash !== receipt.hash ? explorerUrl(fee.transactionHash) : null;
  const purposeHref = activityContextHref(context);
  const isCampaign = context?.type.startsWith("campaign-");
  const title = context ? h(context.type) : h(received ? "received" : "sent", { asset: asset.code });

  function participant(wallet: string | null, label: string) {
    const identity = wallet ? identities.get(wallet) : undefined;
    const isSelf = wallet !== null && wallet === address;
    const handle = identity?.handle;
    const name = handle && /^[a-z0-9_]{3,32}$/.test(handle)
      ? `@${handle}` : isSelf ? h("you") : wallet?.startsWith("C") ? h("contractWallet") : h("wallet");
    return <div className={styles.participant}>
      {wallet?.startsWith("C") ? <span className={styles.contractIcon} aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 6-4 4 4 4m8-8 4 4-4 4m-2-9-4 10" />
        </svg>
      </span> : <AccountAvatar name={name.replace(/^@/, "")} photoUrl={identity?.photoUrl ?? null} size={36} alt={h("photo", { name })} />}
      <div className={styles.participantIdentity}>
        <span>{label}</span>
        <p>
          <strong>{name}</strong>
          {isSelf && name !== h("you") ? <span className={styles.selfBadge}>{h("you")}</span> : null}
        </p>
      </div>
      {wallet ? <span className={styles.shortAddress}><bdi>{wallet.slice(0, 6)}…{wallet.slice(-6)}</bdi></span> : null}
    </div>;
  }

  async function copyHash() {
    try {
      await navigator.clipboard.writeText(receipt.hash);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return <dialog
    ref={dialog}
    id={`activity-receipt-${receipt.id}`}
    className={styles.dialog}
    aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onPointerDown={(event) => { clickedBackdrop.current = event.target === event.currentTarget; }}
    onClick={(event) => {
      if (clickedBackdrop.current && event.target === event.currentTarget) onClose();
      clickedBackdrop.current = false;
    }}
  >
    <div className={styles.sheet}>
      <header className={styles.header}>
        <h2 id={titleId}>{h("viewDetails")}</h2>
        <button ref={closeButton} type="button" className={styles.close} aria-label={h("receiptClose")} onClick={onClose}>
          {Ico.x()}
        </button>
      </header>
      <div className={styles.content}>
        <section className={`${styles.hero} ${received ? styles.received : ""}`}>
          {campaignCover ? <div className={styles.cover} aria-hidden="true">
            <Image src={campaignCover} alt="" fill sizes="(max-width: 500px) 100vw, 500px" />
          </div> : null}
          <div className={styles.heroHeading}>
            <span className={styles.direction} aria-hidden="true">{received ? Ico.arrowDown() : Ico.arrowUp()}</span>
            <h3>{title}</h3>
            <span className={styles.network}>Stellar Testnet</span>
          </div>
          <p className={purposeName ? styles.purpose : styles.amountLabel}>{purposeName ?? h(received ? "amountReceived" : "amountSent")}</p>
          <p className={styles.amount} data-activity-receipt-amount><bdi>{received ? "+" : "−"}{activityStroopsToXlm(receipt.amountStroops)} {asset.code}</bdi></p>
          {equivalent ? <>
            <p className={styles.estimate} data-activity-receipt-estimate={equivalent.status}>
              <bdi>≈ {activityEstimateLabel(equivalent.amount, locale)} USDC</bdi> · {h("marketEstimate")}
            </p>
            <p className={styles.quoteTime}>
              {h(equivalent.status === "stale" ? "quoteStale" : "quoteFresh", { time: dateFormat.format(equivalent.updatedAt * 1000) })}
            </p>
          </> : asset.code === "XLM" ? <p className={styles.quoteTime} data-activity-receipt-estimate="unavailable">{h("quoteUnavailable")}</p> : null}
        </section>

        <p className={styles.recorded}>
          <strong>{h("recordedOnStellar")}</strong>
          <time dateTime={receipt.createdAt}>{dateFormat.format(new Date(receipt.createdAt))}</time>
        </p>
        <div>
          {participant(sender, h("fromLabel"))}
          {participant(recipient, h("toLabel"))}
        </div>

        <div className={styles.fee}>
          <div>
            <strong>{h("fee")}</strong>
            <p>{h(fee.status === "available" ? fee.paidByWallet ? "paidByYou" : "paidByOther" : "feeUnavailable")}</p>
          </div>
          {fee.status === "available" ? <strong className={styles.feeAmount}><bdi>{activityStroopsToXlm(fee.amountStroops)} XLM</bdi></strong> : null}
        </div>

        <div className={styles.hash}>
          <div>
            <span>{m("Transaction hash")}</span>
            <code data-activity-receipt-hash><bdi>{receipt.hash.slice(0, 8)}…{receipt.hash.slice(-8)}</bdi></code>
          </div>
          <button type="button" aria-label={h("copyHash")} className={styles.copy} onClick={copyHash}>
            {copyStatus === "copied" ? Ico.check({ size: 18 }) : <CopyIcon />}
          </button>
          <span className={styles.copyStatus} role="status">
            {copyStatus ? h(copyStatus === "copied" ? "hashCopied" : "hashCopyFailed") : null}
          </span>
        </div>

        <details className={styles.advanced} data-activity-on-chain-details>
          <summary>
            <span><strong>{h("onChainDetails")}</strong><small>{h("onChainDetailsHint")}</small></span>
            <span className={styles.chevron} aria-hidden="true">{Ico.chev()}</span>
          </summary>
          <dl className={styles.technical}>
            <dt>{h("units")}</dt><dd><bdi>{receipt.amountStroops}</bdi></dd>
            {sender ? <><dt>{h("sender")}</dt><dd><bdi>{sender}</bdi></dd></> : null}
            {recipient ? <><dt>{h("recipient")}</dt><dd><bdi>{recipient}</bdi></dd></> : null}
            <dt>{m("Transaction hash")}</dt><dd><bdi>{receipt.hash}</bdi></dd>
            {asset.issuer ? <><dt>{h("issuer")}</dt><dd><bdi>{asset.issuer}</bdi></dd></> : null}
            {asset.contractId ? <><dt>{h("contract")}</dt><dd><bdi>{asset.contractId}</bdi></dd></> : null}
            {fee.status === "available" ? <><dt>{h("feePayer")}</dt><dd><bdi>{fee.payer}</bdi></dd></> : null}
          </dl>
          <p>{h(fee.status === "available" ? "feeScope" : "feeMissing")}</p>
          {fee.status === "available" && fee.feeBump ? <p>{h("feeBump")}</p> : null}
          {feeHref ? <a href={feeHref} target="_blank" rel="noopener noreferrer">{h("feeReceipt")}</a> : null}
        </details>
        {stellarHref ? <a className={styles.stellar} href={stellarHref} target="_blank" rel="noopener noreferrer">
          {m("View transaction on Stellar ↗")}
        </a> : null}
      </div>
      <footer className={styles.footer}>
        {purposeHref ? <Link className={styles.purposeLink} href={purposeHref} onClick={onClose}>
          {h(isCampaign ? "viewCampaign" : "viewPurpose")}
        </Link> : null}
        <p>{h("testnetDisclaimer")}</p>
      </footer>
    </div>
  </dialog>;
}
