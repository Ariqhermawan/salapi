"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { donateCircleTestnet } from "@/app/circle-donation-actions";
import { campaignDonorRecord } from "@/app/campaign-donor-actions";
import { circleDonationAmount, circleDonationTerms } from "@/lib/circles/donation";
import { campaignDonorComment, type CampaignDonorInput } from "@/lib/campaign-donor";
import type { Circle } from "@/lib/circles/types";
import type { CircleTestnetCampaignResult } from "@/lib/circles/testnet";
import { useCircleTestnet } from "@/lib/ui/useCircleTestnet";
import { useCirclesSignupIdentity } from "@/lib/ui/useCirclesSignupIdentity";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import { useGoBack } from "@/lib/ui/useGoBack";
import { formatStroops } from "@/lib/disaster";
import { campaignSplit } from "@/lib/campaign-money";
import CircleTestnetSummary from "@/components/CircleTestnetSummary";
import CampaignDonorActivity from "@/components/CampaignDonorActivity";
import CampaignUpdateSubscription from "@/components/CampaignUpdateSubscription";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import SuccessMotion from "@/components/ui/SuccessMotion";
import { useT } from "@/components/I18nProvider";
import { circleTestnetDonateCopy } from "@/lib/i18n/circle-testnet-donate";
import styles from "./CircleTestnetDonate.module.css";

type Receipt = { campaignId: string; ownerId: string; ownerRevision: number; hash: string; comment: string; anonymous: boolean; publicProfileOk: boolean };
type Review = { terms: Extract<CircleTestnetCampaignResult, { ok: true }>; amount: string; ownerId: string; ownerRevision: number; comment: string; anonymous: boolean; publicProfileOk: boolean };

export default function CircleTestnetDonate({ circle }: { circle: Circle }) {
  const { locale } = useT();
  const text = circleTestnetDonateCopy(locale);
  const goBack = useGoBack(`/circles/${circle.id}`);
  const mapping = useCircleTestnet(circle.id);
  const guard = useUnresolvedSubmission(`circle-donate:${circle.id}`, { keepSuccessLocked: true });
  const [amount, setAmount] = useState("1");
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [publicProfileOk, setPublicProfileOk] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [metadataRetry, setMetadataRetry] = useState(true);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const [feedRevision, setFeedRevision] = useState(0);
  const { identity, refresh: refreshIdentity, captureOwnerRevision, isCurrentOwner } = useCirclesSignupIdentity(() => {
    setReview(null); setReceipt(null); setConfirmed(false); setRecorded(false); setMetadataRetry(true); setError("");
    setComment(""); setAnonymous(true); setPublicProfileOk(false);
  });
  const native = circleDonationAmount(amount);
  const commentValid = campaignDonorComment(comment) !== null;
  const available = mapping.result?.ok && mapping.result.donationOpen;
  const busy = pending;
  const signIn = `/signin?next=${encodeURIComponent(`/circles/${circle.id}/donate`)}`;

  async function attach(entry: Receipt, revision: number) {
    const input: CampaignDonorInput = { hash: entry.hash, expectedOwnerId: entry.ownerId,
      comment: entry.comment, anonymous: entry.anonymous, publicProfileOk: entry.publicProfileOk };
    try {
      const result = await campaignDonorRecord(entry.campaignId, input);
      if (!isCurrentOwner(revision)) return;
      if (result.ok) {
        guard.clearVerified(entry.hash);
        setConfirmed(true); setRecorded(true); setError(""); setFeedRevision(value => value + 1);
      } else {
        if (result.code === "failed_receipt") {
          setConfirmed(false); setReceipt(null); setReview(null); setMetadataRetry(false);
          setError(text("Testnet reports a failed transaction. No donor badge was created. Check submission status before another attempt."));
          return;
        }
        if (result.donationConfirmed) setConfirmed(true);
        setMetadataRetry(result.retryMetadataOnly);
        setError(result.retryMetadataOnly
          ? text("The donor record is not saved yet. Check the receipt, then retry metadata only. Do not send again.")
          : text("This receipt or account could not be verified. Inspect Activity and check your account. Do not send again."));
      }
    } catch {
      if (isCurrentOwner(revision)) setError(text("Donor metadata could not be confirmed. No extra donation was sent."));
    }
  }

  function send() {
    if (!review || !isCurrentOwner(review.ownerRevision) || inFlight.current || guard.locked || identity.status !== "verified" || identity.ownerId !== review.ownerId) return;
    const entry = review;
    const revision = entry.ownerRevision;
    const termsKey = circleDonationTerms(entry.terms);
    if (!termsKey) return;
    inFlight.current = true; setError(""); setMetadataRetry(true);
    startTransition(async () => {
      try {
        const result = await guard.run(() => donateCircleTestnet({ circleId: circle.id, expectedOwnerId: entry.ownerId, termsKey, amount: entry.amount }));
        if (!isCurrentOwner(revision)) return;
        if (!result) { setError(text("Submission status is unknown. Inspect Activity without sending again.")); return; }
        if (!result.ok) {
          setError(result.error);
          if (result.pending && result.hash) setReceipt({ campaignId: entry.terms.mapping.campaignId, ownerId: entry.ownerId,
            ownerRevision: revision, hash: result.hash, comment: entry.comment, anonymous: entry.anonymous, publicProfileOk: entry.publicProfileOk });
          return;
        }
        const saved = { campaignId: result.campaignId, ownerId: result.ownerId, ownerRevision: revision, hash: result.hash,
          comment: entry.comment, anonymous: entry.anonymous, publicProfileOk: entry.publicProfileOk };
        setReceipt(saved); setConfirmed(true); setReview(null);
        await attach(saved, revision);
        if (isCurrentOwner(revision)) await mapping.refresh();
      } finally { inFlight.current = false; }
    });
  }

  function retryMetadata() {
    if (!receipt || !isCurrentOwner(receipt.ownerRevision) || !metadataRetry || inFlight.current || identity.status !== "verified" || receipt.ownerId !== identity.ownerId) return;
    const entry = receipt, revision = receipt.ownerRevision;
    inFlight.current = true;
    startTransition(async () => { try { await attach(entry, revision); } finally { inFlight.current = false; } });
  }

  async function refreshSubmission() {
    // Capture the safeguard hash before a status check clears session storage.
    // It is only a recovery hint. The server must independently prove ownership,
    // the campaign invocation and the committed donation event before recording.
    const hash = guard.state.kind === "locked" ? guard.state.record.hash : null;
    const ownerId = identity.status === "verified" ? identity.ownerId : null;
    const revision = receipt?.ownerRevision ?? captureOwnerRevision();
    const refreshed = await mapping.refresh();
    if (!ownerId || !isCurrentOwner(revision)) return;
    const entry = receipt ?? (hash && refreshed?.ok ? {
      campaignId: refreshed.mapping.campaignId, ownerId, ownerRevision: revision, hash,
      // Reload loses unsaved consent and comments. Never infer permission to
      // expose a profile from a public transaction or the current form values.
      comment: "", anonymous: true, publicProfileOk: false,
    } : null);
    if (!entry || entry.ownerId !== ownerId || !isCurrentOwner(entry.ownerRevision)) return;
    setReceipt(entry);
    await attach(entry, entry.ownerRevision);
  }

  return <div className={styles.screen}>
    <header className={styles.header}><button type="button" onClick={() => review && !receipt ? setReview(null) : goBack()} disabled={busy}>{text("Back")}</button>
      <span>QA · Stellar Testnet</span></header>
    <h1>{text("Test a donation")}</h1><h2>{circle.title}</h2>
    <aside className={styles.boundary}><strong>{text("Fictional cause, real Testnet transaction")}</strong>
      <p>{text("QA wallets receive test tokens, not the pictured organizer or NGO. Testnet XLM has no monetary value. This D4 contract does not send USDC.")}</p></aside>
    <CircleTestnetSummary circleId={circle.id} result={mapping.result} loading={mapping.loading} hideDonate />
    <SubmissionStatusPanel guard={guard} onRefresh={refreshSubmission} confirmedHash={confirmed ? receipt?.hash : undefined} />
    {guard.state.kind === "locked" && !receipt && <p className={styles.hint}>{text("After reload, a recovered donor record defaults to anonymous with no comment or profile permission. Existing saved records are not changed. Recovery never resends funds.")}</p>}
    {identity.status === "guest" ? <Link className={styles.primary} href={signIn}>{text("Sign in with Google")}</Link>
      : identity.status !== "verified" ? <p role="status">{text("Your account must be verified before donating.")} <button type="button" onClick={refreshIdentity} disabled={busy}>{text("Check account")}</button></p> : null}
    {receipt ? <section className={styles.card}>
      {confirmed ? <SuccessMotion title={text("Testnet donation confirmed")}><p>{text("Confirmed Testnet donor. Not a fiat donation or proof of delivery.")}</p></SuccessMotion>
        : <p role="status">{text("A hash was returned. Confirmation is not established yet.")}</p>}
      <a className={styles.address} href={`https://stellar.expert/explorer/testnet/tx/${receipt.hash}`} target="_blank" rel="noopener noreferrer">{text("View Testnet receipt")}: {receipt.hash}</a>
      {recorded ? <p role="status">{text("Your donor record is saved.")}</p> : <button type="button" className={styles.secondary} disabled={busy || !metadataRetry || identity.status !== "verified" || identity.ownerId !== receipt.ownerId} onClick={retryMetadata}>{text("Verify and retry donor record only")}</button>}
      <Link href={`/circles/${circle.id}`}>{text("Back to campaign")}</Link>
    </section> : review ? <section className={styles.card} aria-label={text("Review Testnet donation")}>
      <h2>{text("Review before sending")}</h2>
      <strong className={styles.amount}>{formatStroops(circleDonationAmount(review.amount)!)} XLM</strong>
      <p>{text("Native Testnet XLM moves into this campaign's escrow. Your wallet also pays the Stellar network fee in XLM; the actual fee is on the receipt.")}</p>
      <dl><div><dt>{text("Campaign")}</dt><dd>#{review.terms.mapping.campaignId}</dd></div>
        <div><dt>{text("QA beneficiary")}</dt><dd className={styles.address}>{review.terms.mapping.beneficiaryWallet}</dd></div>
        <div><dt>{text("Creator share")}</dt><dd>{review.terms.mapping.creatorCutBps / 100}%</dd></div>
        <div><dt>{text("Public display")}</dt><dd>{review.anonymous ? text("Anonymous") : review.publicProfileOk ? text("Wallet and opted-in profile") : text("Wallet only")}</dd></div></dl>
      <p>{text("Two configured reviewers must approve the exact proof before release. No timely approval means the contract's refund rules apply. No real-world delivery is guaranteed.")}</p>
      {review.comment && <blockquote>{review.comment}</blockquote>}
      <button type="button" className={styles.primary} disabled={busy || guard.locked || identity.status !== "verified" || identity.ownerId !== review.ownerId} aria-busy={busy} onClick={send}>{busy ? text("Waiting for Testnet…") : text("Confirm Testnet donation")}</button>
      <button type="button" className={styles.secondary} disabled={busy} onClick={() => setReview(null)}>{text("Change amount")}</button>
    </section> : available ? <section className={styles.card}>
      <label htmlFor="circle-testnet-amount">{text("Amount in native Testnet XLM")}</label>
      <div className={styles.amountInput}><input id="circle-testnet-amount" inputMode="decimal" autoComplete="off" value={amount} disabled={busy || guard.locked}
        onChange={event => { setAmount(event.target.value); setError(""); }} aria-invalid={native === null} /><strong>XLM</strong></div>
      <p>{text("Positive amounts, up to 7 decimal places. No dollar-to-XLM simulation.")}</p>
      {native && mapping.result?.ok ? <dl><div><dt>{text("Beneficiary share")}</dt><dd>{formatStroops(campaignSplit(native, BigInt(mapping.result.mapping.creatorCutBps)).beneficiary)} XLM</dd></div>
        <div><dt>{text("Creator share")}</dt><dd>{formatStroops(campaignSplit(native, BigInt(mapping.result.mapping.creatorCutBps)).creator)} XLM</dd></div></dl> : null}
      <label className={styles.check}><input type="checkbox" checked={anonymous} disabled={busy} onChange={event => { setAnonymous(event.target.checked); setPublicProfileOk(false); }} />{text("Display anonymously in the donor feed")}</label>
      <p className={styles.hint}>{text("Anonymous hides your wallet, name, photo and receipt link here. Transactions remain public on Stellar and timing or amounts can still identify you.")}</p>
      {!anonymous && <label className={styles.check}><input type="checkbox" checked={publicProfileOk} disabled={busy} onChange={event => setPublicProfileOk(event.target.checked)} />{text("Also publish my available @username and permitted profile photo for this donation")}</label>}
      <label htmlFor="circle-testnet-comment">{text("Optional public comment")}</label><textarea id="circle-testnet-comment" rows={3} maxLength={500} value={comment} disabled={busy} onChange={event => setComment(event.target.value)} aria-invalid={!commentValid} />
      <p className={styles.hint}>{text("Maximum 500 UTF-8 bytes. Do not include private information; anonymous comments are still public.")}</p>
      <button type="button" className={styles.primary} disabled={!native || !commentValid || busy || guard.locked || identity.status !== "verified"} onClick={() => {
        if (identity.status !== "verified" || !mapping.result?.ok || !mapping.result.donationOpen || !native || !commentValid) return;
        setError(""); setReview({ terms: mapping.result, amount, ownerId: identity.ownerId, ownerRevision: captureOwnerRevision(), comment: campaignDonorComment(comment)!, anonymous, publicProfileOk });
      }}>{text("Review Testnet donation")}</button>
    </section> : !mapping.loading ? <button type="button" className={styles.secondary} disabled={busy} onClick={() => void mapping.refresh()}>{text("Check campaign availability")}</button> : null}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {mapping.result?.ok && <><CampaignUpdateSubscription campaignId={mapping.result.mapping.campaignId} /><CampaignDonorActivity campaignId={mapping.result.mapping.campaignId} refreshKey={feedRevision} /></>}
  </div>;
}
