"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { joinCirclesWaitlist } from "@/app/actions";
import { useGoBack } from "@/lib/ui/useGoBack";
import { Ico, T, PoweredByStellar } from "@/components/ui/kit";
import {
  CURRENCY,
  formatLocalAmount,
  localAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import type { Locale } from "@/lib/i18n/config";
import { isLocalPreview } from "@/lib/local-preview";
import type { Circle, CircleCategory } from "@/lib/circles/types";
import { previewPledgeAllocation } from "@/lib/circles/pledge-allocation";
import { recordLocalSupport, type LocalSupportRecord } from "@/lib/circles/local-support";
import { getOrganizerForCircle } from "@/lib/circles/organizers";
import SuccessMotion from "@/components/ui/SuccessMotion";
import OrganizerVerification from "@/components/ui/OrganizerVerification";
import styles from "./CirclesDonateRevamp.module.css";
import { circlesCopy } from "@/lib/i18n/revamp-circles";

type Phase = "amount" | "review" | "waitlist" | "done";
const quickAmounts: Record<Locale, number[]> = {
  en: [5, 10, 20, 50],
  tl: [100, 250, 500, 1000],
  id: [25000, 50000, 100000, 250000],
  vi: [50000, 100000, 250000, 500000],
};

const photos: Partial<Record<CircleCategory, string>> = {
  disaster: "/circles/disaster.jpg",
  medical: "/circles/medical.jpg",
  education: "/circles/education.jpg",
};

type Allocation = NonNullable<ReturnType<typeof previewPledgeAllocation>>;

function AllocationTicket({ allocation, currency }: { allocation: Allocation | null; currency: Locale }) {
  const { locale } = useT();
  const c = circlesCopy(locale);
  return (
    <section className={styles.ticket} aria-label={c("Illustrative pledge allocation")}>
      <div className={styles.ticketHeader}>
        <h2>{c("Where your pledge would go")}</h2>
        <strong>{allocation ? formatLocalAmount(allocation.total, currency) : "-"}</strong>
      </div>
      <div className={styles.allocationBar} aria-hidden="true">
        <span className={styles.beneficiaryBar} style={{ width: `${allocation?.beneficiaryPct ?? 0}%` }} />
        <span className={styles.organizerBar} style={{ width: `${allocation?.organizerPct ?? 0}%` }} />
      </div>
      <dl className={styles.allocationRows}>
        <div>
          <dt className={styles.beneficiaryLabel}>{c("Beneficiary")}</dt>
          <dd className={styles.percentage}>{allocation ? `${allocation.beneficiaryPct}%` : "-"}</dd>
          <dd className={styles.rowAmount}>{allocation ? formatLocalAmount(allocation.beneficiary, currency) : "-"}</dd>
        </div>
        <div>
          <dt className={styles.organizerLabel}>{c("Organizer operations")}</dt>
          <dd className={styles.percentage}>{allocation ? `${allocation.organizerPct}%` : "-"}</dd>
          <dd className={styles.rowAmount}>{allocation ? formatLocalAmount(allocation.organizer, currency) : "-"}</dd>
        </div>
      </dl>
      <p className={styles.ticketNote}>{c("Illustrative allocation. No money moves.")}</p>
      {allocation ? <p className={styles.roundingNote}>{c("Shares are rounded to {code} {units}; the rows add up to your amount.", { code: CURRENCY[currency].code, units: c(CURRENCY[currency].dp === 0 ? "whole units" : "cents") })}</p> : null}
    </section>
  );
}

export default function CirclesDonateScreen({ circle }: { circle: Circle }) {
  const goBack = useGoBack(`/circles/${circle.id}`);
  const { locale, currency } = useT();
  const c = circlesCopy(locale);
  const [phase, setPhase] = useState<Phase>("amount");
  const [entry, setEntry] = useState<{ value: string; currency: Locale }>({
    value: String(quickAmounts[currency][1]),
    currency,
  });
  const [anonymous, setAnonymous] = useState(false);
  const [marketingOk, setMarketingOk] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [localSaved, setLocalSaved] = useState<LocalSupportRecord | null>(null);
  const confirmingLocal = useRef(false);
  const organizer = getOrganizerForCircle(circle);
  const cover = circle.coverImage ?? photos[circle.category] ?? "/illustrations/giving.png";
  const savedAllocation = localSaved ? previewPledgeAllocation(localSaved.displayValue, localSaved.currency, localSaved.organizerPct) : null;
  // Keep the economic preview value when the display currency changes.
  // A typed $10 means USD 10 here, never raw PHP 10 under a dollar symbol.
  const displayValue =
    entry.currency === currency
      ? entry.value
      : localAmount(
          pesoFromLocal(Number(entry.value), entry.currency),
          currency,
        ).toFixed(CURRENCY[currency].dp);
  const amount = Number(displayValue);
  const normalizedValue = displayValue.trim();
  const allocation = previewPledgeAllocation(displayValue, currency, circle.allowance?.percentage ?? 0);
  const decimalPlaces = normalizedValue.includes(".") ? normalizedValue.split(".")[1]?.length ?? 0 : 0;
  const overPrecision = /^\d+(\.\d+)?$/.test(normalizedValue) && decimalPlaces > CURRENCY[currency].dp;
  const exceedsLimit = Number.isFinite(amount) && pesoFromLocal(amount, currency) > 10_000_000;
  const amountIssue = displayValue.trim() === "" ? c("Enter a positive illustrative amount.")
    : overPrecision ? c("{code} supports {dp} decimal places. Enter an amount without extra decimals; this preview does not round your input.", { code: CURRENCY[currency].code, dp: CURRENCY[currency].dp })
      : exceedsLimit ? c("The preview amount must not exceed the equivalent of PHP 10,000,000.")
        : !allocation ? c("Enter a positive amount that can be allocated in {code}'s supported units.", { code: CURRENCY[currency].code })
          : "";
  const validAmount =
    displayValue.trim() !== "" &&
    /^\d+(\.\d+)?$/.test(normalizedValue) &&
    Number.isFinite(amount) &&
    amount > 0 &&
    pesoFromLocal(amount, currency) <= 10_000_000 &&
    allocation !== null;

  function submitNotification() {
    setError("");
    if (!validAmount) {
      setError(amountIssue || c("Enter a positive preview amount first."));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(c("Enter a valid email address."));
      return;
    }
    if (isLocalPreview) {
      setPhase("done");
      return;
    }
    startTransition(async () => {
      try {
        const result = await joinCirclesWaitlist({
          email: email.trim(),
          circleId: circle.id,
          locale,
          pesoPledge: pesoFromLocal(amount, currency),
          anonymous,
          marketingOk,
        });
        if (!result.ok) {
          setError(
            result.error || c("The signup request could not be processed."),
          );
          return;
        }
        // This action can return ok without database persistence when its service
        // is unconfigured. Do not claim a saved pledge or a completed donation.
        setPhase("done");
      } catch {
        setError(
          c("The signup result could not be confirmed. No payment was made."),
        );
      }
    });
  }

  function confirmLocalDemo() {
    if (!isLocalPreview || phase !== "review" || confirmingLocal.current) return;
    setError("");
    if (!validAmount) { setError(amountIssue || c("Enter a valid local demo amount.")); return; }
    if (circle.status === "completed") { setError(c("This example is complete. Choose an active cause for a local demo.")); return; }
    confirmingLocal.current = true;
    const saved = recordLocalSupport({ circle, displayValue, currency });
    if (!saved) {
      confirmingLocal.current = false;
      setError(c("Browser session storage could not save this local demo. Nothing is recorded as saved, and no money moved. Try again or keep exploring."));
      return;
    }
    setLocalSaved(saved);
    setPhase("done");
  }

  function backFromPhase() {
    if (phase === "review" || phase === "waitlist") {
      setError("");
      setPhase("amount");
      return;
    }
    // Initial entry and completed outcomes leave the flow. Going back never
    // repeats a saved demo, a signup request or a payment confirmation.
    goBack();
  }

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button type="button" className={styles.back} onClick={backFromPhase}>
          {Ico.back({ size: 18, c: T.action })}{c("Back")}</button>
        <div>
          <h1>{c("Donate")}</h1>
          <span>{c("Prototype · no payment")}</span>
        </div>
      </div>
      <section className={styles.cause} aria-label={c("Example cause")}>
        <Image src={cover} width={120} height={90} className={cover === "/illustrations/giving.png" ? styles.causeDoodle : styles.causePhoto} alt={cover === "/illustrations/giving.png" ? c("Two people sharing a blue heart") : circle.imageAlt || c("AI-generated fictional cause cover, not verified evidence")} />
        <div>
          <h2>{circle.title}</h2>
          <p>{c("Example cause · AI image ·")}{" "}{circle.organizerLocation}</p>
          <Link href={`/circles/${circle.id}/organizer`} className={styles.organizerLink} aria-label={c("View example organizer profile: {name}", { name: circle.organizer })}>
            <span>{circle.organizer}</span>{Ico.chev({ size: 15, c: T.action })}
          </Link>
          {organizer ? <OrganizerVerification kind={organizer.kind} compact /> : null}
        </div>
      </section>
      {phase === "amount" && (
        <>
          <section className={styles.warmCard}>
            <label htmlFor="circle-preview-amount" className={styles.eyebrow}>{c("Illustrative pledge ·")}{CURRENCY[currency].code}
            </label>
            <div className={styles.amount}>
              <span>{CURRENCY[currency].symbol}</span>
              <input
                id="circle-preview-amount"
                inputMode="decimal"
                autoComplete="off"
                aria-describedby={`circle-amount-help${amountIssue ? " circle-amount-error" : ""}`}
                aria-invalid={!validAmount}
                value={displayValue}
                onChange={(event) => {
                  setEntry({
                    value: event.target.value,
                    currency,
                  });
                  setError("");
                }}
              />
            </div>
            <div className={styles.quickAmounts}>
              {quickAmounts[currency].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.filter}
                  aria-pressed={validAmount && amount === value}
                  onClick={() => {
                    setEntry({ value: String(value), currency });
                    setError("");
                  }}
                >
                  {formatLocalAmount(value, currency)}
                </button>
              ))}
            </div>
            <p id="circle-amount-help" className={styles.hint}>
              {c("Choose an example amount in {code}. Currency conversion is illustrative. No balance is charged or reserved.", { code: CURRENCY[currency].code })}
            </p>
            {amountIssue ? <p id="circle-amount-error" role="alert" className={styles.inputError}>{amountIssue}</p> : null}
          </section>
          <AllocationTicket allocation={validAmount ? allocation : null} currency={currency} />
          <p className={styles.feeFact}>{c("Platform fee: not configured. No extra fee is added in this preview.")}</p>
          {error && (
            <div role="alert" className={styles.error}>
              {error}
            </div>
          )}
          <div className={styles.action}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={!validAmount || (isLocalPreview && circle.status === "completed")}
              onClick={() => {
                if (!validAmount) { setError(amountIssue || c("Enter a valid preview amount first.")); return; }
                if (isLocalPreview && circle.status === "completed") { setError(c("This example is complete. Choose an active cause for a local demo.")); return; }
                setError("");
                setPhase(isLocalPreview ? "review" : "waitlist");
              }}
            >
              {isLocalPreview ? c("Review local donation") : c("Continue to optional signup")}
              {Ico.chev({ size: 18, c: "#fff" })}
            </button>
          </div>
          {isLocalPreview && circle.status === "completed" ? <p className={styles.inputError} role="status">{c("This example is complete. Choose an active cause for a local donation demo.")}</p> : null}
          <p className={styles.noPayment}>{isLocalPreview ? c("A browser-only donation demo. No payment method, authorization or on-chain transaction.") : c("Optional notification preference only. No payment method, authorization or on-chain donation.")}</p>
          {isLocalPreview ? <button type="button" className={styles.optionalSignup} onClick={() => { setError(""); setPhase("waitlist"); }} disabled={!validAmount}>{c("Optional launch signup")}</button> : null}
        </>
      )}
      {phase === "review" && isLocalPreview && (
        <>
          <section className={styles.reviewIntro}>
            <span className={styles.eyebrow}>{c("Review local donation demo")}</span>
            <h2>{c("Check your cause and amount.")}</h2>
            <p>{c("Confirming saves a simulated donation in this browser tab only, so you can follow its example updates. It does not send tokens, email or a network request.")}</p>
          </section>
          <AllocationTicket allocation={validAmount ? allocation : null} currency={currency} />
          <p className={styles.feeFact}>{c("Platform fee: not configured. No extra fee is added in this preview.")}</p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button type="button" className={styles.primaryButton} disabled={!validAmount || circle.status === "completed"} onClick={confirmLocalDemo}>{c("Confirm local demo")}{" "}{Ico.check({ size: 19, c: "#fff" })}</button>
          <button type="button" className={styles.optionalSignup} onClick={() => { setError(""); setPhase("amount"); }}>{c("Change amount")}</button>
        </>
      )}
      {phase === "waitlist" && (
        <>
          <AllocationTicket allocation={validAmount ? allocation : null} currency={currency} />
          <p className={styles.feeFact}>{c("Platform fee: not configured. No extra fee is added in this preview.")}</p>
          <section className={styles.reviewNote}>
            <span className={styles.eyebrow}>{c("Your example preference")}</span>
            <p>{c("No payment. No guaranteed launch date. This amount is not a committed donation.")}</p>
            <button
              type="button"
              className={styles.back}
              onClick={() => setPhase("amount")}
            >{c("Change amount")}</button>
          </section>
          <form
            className={styles.card}
            onSubmit={(event) => {
              event.preventDefault();
              submitNotification();
            }}
          >
            <div className={styles.form}>
              <h2>{c("Hear when Circles is ready.")}</h2>
              <label htmlFor="circle-launch-email" className={styles.field}>{c("Email address")}<input
                  id="circle-launch-email"
                  className={styles.input}
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={200}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={pending}
                  placeholder="you@example.com"
                />
              </label>
              <label className={styles.checks}>
                <input
                  type="checkbox"
                  checked={anonymous}
                  onChange={(event) => setAnonymous(event.target.checked)}
                  disabled={pending}
                />{c("Prefer a private display name if this concept launches. This does not hide the email in your signup request.")}</label>
              <label className={styles.checks}>
                <input
                  type="checkbox"
                  checked={marketingOk}
                  onChange={(event) => setMarketingOk(event.target.checked)}
                  disabled={pending}
                />{c("I also want optional Salapi product updates. This is not required to join the launch list.")}</label>
              <p className={styles.hint}>
                {isLocalPreview
                  ? c("Local preview: this signup is simulated. Your email will not be sent or stored.")
                  : c("Submitting sends your email, example cause, amount preference, language and selected preferences to Salapi. It does not authorize a donation.")}
              </p>
            </div>
            {error && (
              <div role="alert" className={styles.error}>
                {error}
              </div>
            )}
            <div className={styles.action}>
              <button type="submit" className={styles.primaryButton} aria-busy={pending} disabled={pending || !email.trim() || !validAmount}>
                {pending
                  ? c("Processing request…")
                  : isLocalPreview
                    ? c("Preview signup")
                    : c("Request launch notification")}
              </button>
            </div>
          </form>
        </>
      )}
      {phase === "done" && (
        <>
          {localSaved ? <SuccessMotion title={c("Local donation demo saved. No money moved.")}><p>{c("Your simulated support is saved in this browser tab only. Follow fictional cause updates without a wallet or payment.")}</p></SuccessMotion> : null}
          <AllocationTicket allocation={localSaved ? savedAllocation : validAmount ? allocation : null} currency={localSaved?.currency ?? currency} />
          <p className={styles.feeFact}>{c("Platform fee: not configured. No extra fee is added in this preview.")}</p>
          {!localSaved ? <section className={styles.success} role="status">
            <strong>
              {isLocalPreview
                ? c("Example signup complete. Nothing was sent.")
                : c("Your signup request was processed.")}
            </strong>
            <p>
              {isLocalPreview
                ? c("Your email stays in this screen only. No funds moved and no account data changed.")
                : c("No payment was made. This is not a saved donation, an on-chain receipt or a guarantee that the service has stored the request.")}
            </p>
          </section> : <Link className={styles.primaryButton} href="/circles/supported">{c("My supported causes")}{" "}{Ico.chev({ size: 18, c: "#fff" })}</Link>}
          <Link href={`/circles/${circle.id}`} className={styles.cardLink}>{c("Back to the example cause")}{Ico.chev({ size: 14, c: T.action })}
          </Link>
        </>
      )}
      <Link href="/campaigns?mode=testnet" className={styles.campaignLink}>
        <div>
          <strong>{c("Explore D4 Testnet campaigns")}</strong>
          <span>{isLocalPreview ? c("A separate local campaign preview. No transaction is submitted.") : c("Testnet campaign escrow and proof review. This Circles prototype does not transfer funds.")}</span>
        </div>
        {Ico.chev({ size: 18, c: T.action })}
      </Link>
      <footer className={styles.footer}>
        <PoweredByStellar />
        <span>{c("Circles prototype · No real donations.")}</span>
      </footer>
    </div>
  );
}
