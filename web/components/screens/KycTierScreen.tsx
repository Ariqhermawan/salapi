"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/components/I18nProvider";
import { Ico, T, PoweredByStellar } from "@/components/ui/kit";
import { Stage2Pill, WhyExistsLink } from "@/components/ui/OperationalAllowanceExplainer";
import OrganizerVerification from "@/components/ui/OrganizerVerification";
import { KYC_TIER_CEILING, type KycTier } from "@/lib/circles/allowance";
import { isLocalPreview } from "@/lib/local-preview";
import { createSumsubDemoState, canPrepareSumsubDemo, canExploreSumsubDemo, canChooseSumsubDemoResult, transitionSumsubDemo, SUMSUB_CHECKLIST, SUMSUB_SAMPLE_DOCUMENTS, type SumsubDemoEvent, type SumsubDemoResult, type SumsubDocumentType } from "@/lib/verification/sumsub-demo";
import styles from "./KycTierRevamp.module.css";
import { accountCopy, accountText, type AccountCopyKey } from "@/lib/i18n/revamp-account";
import { useGoBack } from "@/lib/ui/useGoBack";

const checkCopy: Record<string, { title: AccountCopyKey; body: AccountCopyKey }> = {
  identity: { title: "identityDocument", body: "identityDocumentBody" },
  selfie: { title: "selfie", body: "selfieBody" },
  registration: { title: "registration", body: "registrationBody" },
  representative: { title: "representative", body: "representativeBody" },
};
const outcomes: { value: SumsubDemoResult; title: AccountCopyKey; body: AccountCopyKey }[] = [
  { value: "pending", title: "pendingDemo", body: "underReview" },
  { value: "approved", title: "approvedDemo", body: "noIdentityVerified" },
  { value: "retry", title: "retryRequired", body: "moreInformation" },
  { value: "rejected", title: "rejectedDemo", body: "notApproved" },
];
const sampleDocumentCopy: Record<SumsubDocumentType, AccountCopyKey> = {
  "national-id": "nationalIdSample", passport: "passportSample", license: "licenseSample",
  registration: "registrationSample", "tax-paper": "taxPaperSample", permit: "permitSample",
};
const tierRequirements: Record<KycTier, AccountCopyKey> = {
  0: "tier0", 1: "tier1", 2: "tier2",
};

function OutcomeIcon({ value }: { value: SumsubDemoResult }) {
  if (value === "approved") return Ico.check({ size: 22, c: "#2563eb" });
  if (value === "rejected") return Ico.x({ size: 22, c: "#bb3939" });
  if (value === "retry") return Ico.shield({ size: 22, c: "#8a6422" });
  return Ico.refresh({ size: 22, c: "#586985" });
}

export default function KycTierScreen() {
  const goBack = useGoBack("/settings");
  const { t, locale } = useT();
  const c = accountCopy(locale);
  const [demo, setDemo] = useState(createSumsubDemoState);
  const prepared = canPrepareSumsubDemo(demo);
  const sampleReady = canExploreSumsubDemo(demo);
  const canChoose = isLocalPreview && canChooseSumsubDemoResult(demo);
  const step = ["checklist", "document", "selfie"].includes(demo.phase) ? 1 : demo.phase === "handoff" ? 2 : 3;
  const result = demo.phase === "review" || demo.phase === "handoff" ? undefined : outcomes.find((outcome) => outcome.value === demo.phase);
  const submitted = demo.phase === "review" || !!result;
  const currentTier: KycTier = 0;

  function send(event: SumsubDemoEvent) {
    setDemo((current) => transitionSumsubDemo(current, event, isLocalPreview));
  }

  function back() {
    if (isLocalPreview && ["document", "selfie", "handoff", "review", "pending"].includes(demo.phase)) send({ type: "back" });
    else goBack();
  }

  return <div className={styles.screen}>
    <div className={styles.top}><button type="button" onClick={back} className={styles.back}>{Ico.back({ size: 17, c: T.action })} {c.back}</button><span className={styles.demoLabel}>{c.demo}</span></div>
    <header className={styles.header}><h1>{c.verifyIdentity}</h1><p>{c.sumsubDemo}</p></header>
    <ol className={styles.steps} aria-label={c.progress}>{[c.prepare, c.providerReview, c.result].map((label, index) => <li key={index} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span><strong>{label}</strong></li>)}</ol>
    <section className={styles.handoff} aria-label={c.connectionStatus}><span className={styles.handoffIcon}>{Ico.lock({ size: 26, c: "#586985" })}</span><div><h2>{c.sumsubHandoff}</h2><span className={styles.notConnected}>{c.notConnected}</span><p>{c.sumsubWarning}</p></div></section>
    <p className={styles.noUpload}>{c.sumsubNoUpload}</p>
    {demo.phase === "checklist" ? <>
      <div className={styles.kindPicker} role="group" aria-label={c.applicantType}>
        <button type="button" className={styles.individual} disabled={!isLocalPreview} aria-pressed={demo.kind === "individual"} onClick={() => send({ type: "select-kind", kind: "individual" })}>{Ico.user({ size: 24, c: "#2563eb" })}<span><strong>{c.individual}</strong><small>{c.verifyPerson}</small></span></button>
        <button type="button" className={styles.ngo} disabled={!isLocalPreview} aria-pressed={demo.kind === "ngo"} onClick={() => send({ type: "select-kind", kind: "ngo" })}>{Ico.vault({ size: 24, c: "#8a6422" })}<span><strong>{c.ngo}</strong><small>{c.verifyOrganization}</small></span></button>
      </div>
      <section className={`${styles.checklist} ${demo.kind === "ngo" ? styles.ngoChecklist : ""}`}>
        <h2>{c.beforeBegin}</h2><p>{accountText(locale, "previewChecks", { kind: demo.kind === "ngo" ? c.ngo : c.individual })}</p>
        <div className={styles.checks}>{SUMSUB_CHECKLIST[demo.kind].map((id) => <label key={id}><input type="checkbox" checked={demo.acknowledged.includes(id)} disabled={!isLocalPreview} onChange={() => send({ type: "toggle-check", id })} /><span><strong>{c[checkCopy[id].title]}</strong><small>{c[checkCopy[id].body]}</small></span></label>)}</div>
      </section>
      {!isLocalPreview ? <p className={styles.guard} role="status">{c.simulationGuard}</p> : <button type="button" className={styles.primary} disabled={!prepared} onClick={() => send({ type: "prepare" })}>{c.continueAction} {Ico.chev({ size: 18, c: "#fff" })}</button>}
    </> : null}
    {demo.phase === "document" ? <>
      <section className={styles.sampleCheck}>
        <h2>{c.sampleDocumentTitle}</h2><p>{c.sampleCheckBody}</p>
        <div className={styles.documentTypes} role="group" aria-label={c.sampleDocumentType}>{SUMSUB_SAMPLE_DOCUMENTS[demo.kind].map(documentType => <button type="button" key={documentType} disabled={!isLocalPreview} aria-pressed={demo.documentType === documentType} onClick={() => send({ type: "select-document", documentType })}>{c[sampleDocumentCopy[documentType]]}</button>)}</div>
        <div className={styles.samplePreview} role="status">{demo.documentSampleReady ? Ico.check({ size: 34, c: T.action }) : Ico.user({ size: 34, c: T.action })}<span><strong>{c.frontOfDocument}</strong>{demo.documentSampleReady ? c.sampleDocumentReady : c.samplePhotoNoCapture}</span></div>
      </section>
      {isLocalPreview ? <div className={styles.stageActions}>
        <button type="button" className={styles.secondary} onClick={() => send({ type: demo.documentSampleReady ? "reset-document-sample" : "complete-document-sample" })}>{demo.documentSampleReady ? c.retakeSample : c.takeSamplePhoto}</button>
        <button type="button" className={styles.primary} disabled={!demo.documentSampleReady} onClick={() => send({ type: "continue-document" })}>{c.continueAction} {Ico.chev({ size: 18, c: "#fff" })}</button>
      </div> : <p className={styles.guard} role="status">{c.simulationGuard}</p>}
    </> : null}
    {demo.phase === "selfie" ? <>
      <section className={styles.sampleCheck}>
        <h2>{c.sampleSelfieTitle}</h2><p>{c.sampleCheckBody}</p>
        <div className={styles.samplePreview} role="status">{demo.selfieSampleReady ? Ico.check({ size: 34, c: T.action }) : Ico.user({ size: 34, c: T.action })}<span>{demo.selfieSampleReady ? c.sampleSelfieReady : c.sampleSelfieNoCapture}</span></div>
      </section>
      {isLocalPreview ? <div className={styles.stageActions}>
        <button type="button" className={styles.secondary} onClick={() => send({ type: demo.selfieSampleReady ? "reset-selfie-sample" : "complete-selfie-sample" })}>{demo.selfieSampleReady ? c.retakeSampleSelfie : c.takeSampleSelfie}</button>
        <button type="button" className={styles.primary} disabled={!sampleReady} onClick={() => send({ type: "explore" })}>{c.continueAction} {Ico.chev({ size: 18, c: "#fff" })}</button>
      </div> : <p className={styles.guard} role="status">{c.simulationGuard}</p>}
    </> : null}
    {demo.phase === "handoff" ? <>
      <section className={styles.sampleCheck}>
        <h2>{c.sampleReview}</h2><p>{c.sumsubNoUpload}</p>
        <dl className={styles.sampleSummary}><div><dt>{demo.kind === "ngo" ? c.registration : c.identityDocument}</dt><dd>{c[sampleDocumentCopy[demo.documentType]]} · {c.frontPhotoSample}</dd></div><div><dt>{c.selfie}</dt><dd>{c.selfieSample}</dd></div></dl>
      </section>
      <button type="button" className={styles.primary} onClick={() => send({ type: "submit" })}>{c.submitForReview} {Ico.chev({ size: 18, c: "#fff" })}</button>
    </> : null}
    {submitted ? <section className={styles.outcomeSection}><h2>{c.selectResult}</h2><p>{c.sumsubNoUpload}</p><div className={styles.outcomes}>{outcomes.map((outcome) => <button type="button" key={outcome.value} disabled={!canChoose} aria-pressed={demo.phase === outcome.value} onClick={() => send({ type: "choose-result", result: outcome.value })}><OutcomeIcon value={outcome.value} /><strong>{c[outcome.title]}</strong><small>{c[outcome.body]}</small></button>)}</div>
      {result ? <section className={`${styles.result} ${demo.phase === "approved" ? demo.kind === "ngo" ? styles.goldResult : styles.blueResult : ""}`} role="status"><OutcomeIcon value={result.value} /><div><h3>{demo.phase === "approved" ? c.kycDone : c[result.title]}</h3><p>{demo.phase === "retry" ? c.retryExample : demo.phase === "pending" ? c.reviewOnly : demo.phase === "rejected" ? c.rejectionOnly : c.noEntitlement}</p>{demo.phase === "approved" ? <OrganizerVerification kind={demo.kind} /> : null}<small>{c.simulationOnly}</small></div></section> : <p className={styles.waiting}>{c.sampleResultPrompt}</p>}
      {isLocalPreview && demo.phase === "retry" ? <button type="button" className={styles.secondary} onClick={() => send({ type: "retry" })}>{c.retryPreparation} {Ico.refresh({ size: 16, c: T.action })}</button> : null}
      {isLocalPreview ? <button type="button" className={styles.reset} onClick={() => send({ type: "reset" })}>{c.resetDemo}</button> : null}
    </section> : null}
    <details className={styles.tiers}><summary><span>{t("kyc.ladderLabel")} · {c.planned}</span>{Ico.chev({ size: 17, c: T.action })}</summary><p>{accountText(locale, "tierWarning", { tier: t(`circles.tier${currentTier}`) })}</p><ol>{([0, 1, 2] as const).map((tier) => <li key={tier}><div><strong>{t(`circles.tier${tier}`)}</strong><span>{accountText(locale, "upTo", { value: KYC_TIER_CEILING[tier] })}</span></div><h3>{t(`kyc.tier${tier}Name`)}</h3><p>{c[tierRequirements[tier]]}</p></li>)}</ol><div className={styles.explainerLinks}><Stage2Pill /><WhyExistsLink label={t("kyc.whyLink")} /></div></details>
    <details className={styles.liveRequirements}><summary>{c.liveRequirements} {Ico.chev({ size: 17, c: T.action })}</summary><p>{c.webhookWarning}</p><p>{c.memoryOnly}</p><Link href="https://docs.sumsub.com/docs/receive-verification-results" target="_blank" rel="noreferrer">{c.sumsubResults} {Ico.link({ size: 14, c: T.action })}</Link><Link href="https://docs.sumsub.com/docs/webhook-manager" target="_blank" rel="noreferrer">{c.webhookSignature} {Ico.link({ size: 14, c: T.action })}</Link></details>
    <Link href="/settings" className={styles.returnLink}>{Ico.back({ size: 17, c: T.action })} {c.returnSettings}</Link>
    <footer className={styles.footer}><PoweredByStellar /><span>{c.noIdentityFooter}</span></footer>
  </div>;
}
