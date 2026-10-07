"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { joinCirclesWaitlist } from "@/app/actions";
import { Ico, T, Btn, PoweredByStellar } from "@/components/ui/kit";
import {
  CURRENCY,
  formatLocalAmount,
  localAmount,
  pesoFromLocal,
} from "@/lib/ui/currency";
import { useT } from "@/components/I18nProvider";
import { isLocale, type Locale } from "@/lib/i18n/config";
import { CATEGORY_LABEL, type CircleCategory } from "@/lib/circles/types";
import { isLocalPreview } from "@/lib/local-preview";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./CirclesPreview.module.css";
import galleryStyles from "./CirclesDraftGallery.module.css";
import { circlesCopy, circlesCategory, circlesSignupError } from "@/lib/i18n/revamp-circles";
import { defaultDraftGallery, draftGalleryOptions, readDraftGallery, replaceDraftPhoto, type DraftGalleryPhoto } from "@/lib/ui/circle-draft-gallery";
import CirclesSignupEmail from "@/components/CirclesSignupEmail";
import { useCirclesSignupIdentity } from "@/lib/ui/useCirclesSignupIdentity";

type Step = 0 | 1 | 2 | 3;
type Draft = {
  version: 1;
  savedAt: string;
  title: string;
  story: string;
  category: CircleCategory;
  target: { localValue: string; currency: Locale; pesoEquivalent: number };
  durationDays: number;
  cover: string;
  gallery?: DraftGalleryPhoto[];
  allowance: { percentage: number; conceptAcknowledged: boolean };
  organizerVerification: "not-performed";
  publication: "browser-draft-only";
};
const DRAFT_KEY = "salapi.circles.draft.v1";
const stepLabels = ["The cause", "The goal", "The details", "Review"] as const;
const categories = Object.keys(CATEGORY_LABEL) as CircleCategory[];
// SSR fields must not accept input or clicks before their React handlers exist.
// Matching server/first-hydration snapshots keep the form disabled until commit.
function subscribeHydration() { return () => {}; }
function clientHydrationSnapshot() { return true; }
function serverHydrationSnapshot() { return false; }
function readDraft(value: unknown): Draft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<Draft>;
  if (
    draft.version !== 1 ||
    typeof draft.title !== "string" ||
    typeof draft.story !== "string" ||
    !categories.includes(draft.category as CircleCategory) ||
    !draft.target ||
    typeof draft.target.localValue !== "string" ||
    !isLocale(draft.target.currency) ||
    !Number.isFinite(Number(draft.target.localValue)) ||
    Number(draft.target.localValue) <= 0 ||
    ![14, 30, 60, 90].includes(draft.durationDays as number) ||
    !draft.allowance ||
    !Number.isFinite(draft.allowance.percentage) ||
    draft.allowance.percentage < 0 ||
    draft.allowance.percentage > 10
  )
    return null;
  const gallery = readDraftGallery(draft.category as CircleCategory, draft.cover, draft.gallery);
  return gallery ? { ...draft, gallery } as Draft : null;
}

export default function CirclesCreateScreen() {
  const hydrated = useSyncExternalStore(subscribeHydration, clientHydrationSnapshot, serverHydrationSnapshot);
  const goBack = useGoBack("/circles");
  const { currency, locale } = useT();
  const c = circlesCopy(locale);
  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState("");
  const [story, setStory] = useState("");
  const [category, setCategory] = useState<CircleCategory>("community");
  const [target, setTarget] = useState<{ value: string; currency: Locale }>({
    value: localAmount(50_000, currency).toFixed(CURRENCY[currency].dp),
    currency,
  });
  const [durationDays, setDurationDays] = useState(30);
  const [gallery, setGallery] = useState<DraftGalleryPhoto[]>(defaultDraftGallery("community"));
  const [failedPhotos, setFailedPhotos] = useState<string[]>([]);
  const [allowancePct, setAllowancePct] = useState(0);
  const [allowanceAck, setAllowanceAck] = useState(false);
  const [draftAck, setDraftAck] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [savedDraft, setSavedDraft] = useState<Draft | null>(null);
  const [draftPersisted, setDraftPersisted] = useState(false);
  const [email, setEmail] = useState("");
  const [waitlistAck, setWaitlistAck] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [waitlistError, setWaitlistError] = useState("");
  const [waitlistPending, startWaitlist] = useTransition();
  const waitlistSubmitting = useRef(false);
  const { identity, refresh: refreshIdentity, captureOwnerRevision, isCurrentOwner } = useCirclesSignupIdentity(() => {
    setEmail(""); setWaitlistAck(false); setWaitlisted(false); setWaitlistError("");
  });

  const displayTarget =
    target.currency === currency
      ? target.value
      : localAmount(
          pesoFromLocal(Number(target.value), target.currency),
          currency,
        ).toFixed(CURRENCY[currency].dp);
  const goal = Number(displayTarget);
  const validGoal =
    displayTarget.trim() !== "" &&
    /^\d+(\.\d+)?$/.test(displayTarget) &&
    Number.isFinite(goal) &&
    goal > 0;
  const galleryOptions = draftGalleryOptions(category);

  function changeCategory(nextCategory: CircleCategory) {
    if (!categories.includes(nextCategory) || nextCategory === category) return;
    setCategory(nextCategory);
    setGallery(defaultDraftGallery(nextCategory));
    setFailedPhotos([]);
  }

  function choosePhoto(index: number, src: string) {
    const nextGallery = replaceDraftPhoto(category, gallery, index, src);
    if (nextGallery) setGallery(nextGallery);
  }

  function renderGallery(photos: readonly DraftGalleryPhoto[], editable = false) {
    const content = <>
      <p id="circle-draft-gallery-note" className={galleryStyles.notice}>
        {c("Three distinct example images. The first is the cover. Added photos are AI concepts, not uploads or delivery proof; nothing is published.")}
      </p>
      <div className={galleryStyles.photos}>
        {photos.map((photo, index) => <figure className={galleryStyles.photo} key={photo.src}>
          {failedPhotos.includes(photo.src)
            ? <div className={galleryStyles.failure} role="status">{c("Photo unavailable")}</div>
            // eslint-disable-next-line @next/next/no-img-element
            : <img className={galleryStyles.image} src={photo.src} alt={photo.alt} onError={() => setFailedPhotos(current => current.includes(photo.src) ? current : [...current, photo.src])} />}
          <figcaption>
            {editable ? <>
              <label className={galleryStyles.label} htmlFor={`circle-draft-photo-${index}`}>
                {index === 0 ? c("Photo 1 · cover") : c("Photo {index} of {count}", { index: index + 1, count: photos.length })}
              </label>
              <select id={`circle-draft-photo-${index}`} className={galleryStyles.select} value={photo.src}
                aria-describedby="circle-draft-gallery-note" onChange={event => choosePhoto(index, event.target.value)}>
                {!galleryOptions.some(option => option.src === photo.src) && <option value={photo.src}>{c("Restored legacy cover")}</option>}
                {galleryOptions.map((option, optionIndex) => <option key={option.src} value={option.src}
                  disabled={photos.some((selected, at) => at !== index && selected.src === option.src)}>
                  {c("AI {index}", { index: optionIndex + 1 })}
                </option>)}
              </select>
            </> : <strong>{index === 0 ? c("Photo 1 · cover") : c("Photo {index} of {count}", { index: index + 1, count: photos.length })}</strong>}
            <span>{photo.src.startsWith("/circles/generated/") ? c("AI illustration") : c("Restored legacy cover")}</span>
          </figcaption>
        </figure>)}
      </div>
    </>;
    return editable ? <fieldset className={galleryStyles.gallery}>
      <legend className={galleryStyles.heading}>{c("Choose three example photos")}</legend>{content}
    </fieldset> : <section className={galleryStyles.gallery} aria-label={c("Browser draft photo gallery")}>
      <h3 className={galleryStyles.heading}>{c("Three-photo browser draft gallery")}</h3>{content}
    </section>;
  }

  function validate(atStep: Step): boolean {
    if (atStep === 0 && title.trim().length < 6) {
      setError(c("Give the cause a title with at least 6 characters."));
      return false;
    }
    if (atStep === 0 && story.trim().length < 40) {
      setError(c("Describe the cause in at least 40 characters."));
      return false;
    }
    if (atStep === 1 && !validGoal) {
      setError(c("Enter a positive goal in the currency shown."));
      return false;
    }
    if (atStep === 2 && allowancePct > 0 && !allowanceAck) {
      setError(
        c("Acknowledge that the allowance is a concept before continuing."),
      );
      return false;
    }
    if (atStep === 2 && !readDraftGallery(category, gallery[0]?.src, gallery)) {
      setError(c("Choose three different example photos before continuing."));
      return false;
    }
    return true;
  }
  function next() {
    setError("");
    setNote("");
    if (validate(step)) setStep((current) => Math.min(3, current + 1) as Step);
  }
  function saveDraft() {
    setError("");
    for (const check of [0, 1, 2] as Step[])
      if (!validate(check)) {
        setStep(check);
        return;
      }
    if (!draftAck) {
      setError(c("Confirm that this is a browser-only concept draft."));
      return;
    }
    const draft: Draft = {
      version: 1,
      savedAt: new Date().toISOString(),
      title: title.trim(),
      story: story.trim(),
      category,
      target: {
        localValue: displayTarget,
        currency,
        pesoEquivalent: pesoFromLocal(goal, currency),
      },
      durationDays,
      cover: gallery[0].src,
      gallery,
      allowance: {
        percentage: allowancePct,
        conceptAcknowledged: allowanceAck,
      },
      organizerVerification: "not-performed",
      publication: "browser-draft-only",
    };
    // Preparation is independent of optional browser persistence. A blocked
    // storage permission must not remove the draft or its explicit signup path.
    setSavedDraft(draft);
    setDraftPersisted(false);
    setWaitlisted(false);
    setWaitlistAck(false);
    setWaitlistError("");
    let previous: string | null = null;
    let writeAttempted = false;
    try {
      // Unlike the old waitlist payload, this explicitly saves every creation
      // field. It is a local draft, not a published or on-chain campaign.
      previous = localStorage.getItem(DRAFT_KEY);
      const serialized = JSON.stringify(draft);
      writeAttempted = true;
      localStorage.setItem(DRAFT_KEY, serialized);
      if (localStorage.getItem(DRAFT_KEY) !== serialized) {
        throw new Error("Draft read-back failed");
      }
      setDraftPersisted(true);
    } catch {
      // A failed write or read-back must not intentionally erase the previous
      // draft. Roll back only this key; permission denial may also deny rollback.
      if (writeAttempted) {
        try {
          if (previous !== null) localStorage.setItem(DRAFT_KEY, previous);
          else localStorage.removeItem(DRAFT_KEY);
        } catch { /* Keep the in-memory draft and truthful unsaved status. */ }
      }
      setError(
        c("Browser storage could not confirm a save. Your complete draft is only in this screen. Download it or keep this page open; optional signup is still available."),
      );
    }
  }
  function restoreDraft() {
    setError("");
    setNote("");
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const draft = raw ? readDraft(JSON.parse(raw)) : null;
      if (!draft) {
        setNote(c("No compatible saved draft was found in this browser."));
        return;
      }
      setTitle(draft.title.slice(0, 90));
      setStory(draft.story.slice(0, 1500));
      setCategory(draft.category);
      setTarget({
        value: draft.target.localValue,
        currency: draft.target.currency,
      });
      setDurationDays(draft.durationDays);
      setGallery(draft.gallery!);
      setFailedPhotos([]);
      setAllowancePct(draft.allowance.percentage);
      setAllowanceAck(Boolean(draft.allowance.conceptAcknowledged));
      setStep(0);
      setDraftAck(false);
      setNote(
        c("The last browser draft is restored. Review it before saving again."),
      );
    } catch {
      setError(
        c("The browser draft could not be read. Your current entries are unchanged."),
      );
    }
  }
  function downloadDraft() {
    if (!savedDraft) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(savedDraft, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "salapi-circle-draft.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  function submitWaitlist() {
    if (waitlistSubmitting.current || waitlisted || !savedDraft) return;
    setWaitlistError("");
    const trimmed = email.trim();
    if (identity.status !== "guest" && identity.status !== "verified") {
      setWaitlistError(c("Your account could not be verified. Nothing was saved. Try again."));
      return;
    }
    if (identity.status === "guest" && (trimmed.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))) {
      setWaitlistError(c("Enter a valid email address of up to 200 characters."));
      return;
    }
    if (!waitlistAck) {
      setWaitlistError(c("Consent to the optional organizer launch signup before continuing."));
      return;
    }
    waitlistSubmitting.current = true;
    const requestedOwnerRevision = captureOwnerRevision();
    startWaitlist(async () => {
      try {
        // A browser draft never submits automatically. In local review mode,
        // even this explicit optional signup remains a non-persistent example.
        if (isLocalPreview) { setWaitlisted(true); return; }
        const slug = savedDraft.title.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 40) || "your-circle";
        const result = await joinCirclesWaitlist({
          ...(identity.status === "verified" ? { expectedOwnerId: identity.ownerId } : { email: trimmed }),
          circleId: `draft:${slug}`,
          locale,
          pesoPledge: savedDraft.target.pesoEquivalent,
          anonymous: false,
          notifyOk: waitlistAck,
          marketingOk: false,
        });
        if (!isCurrentOwner(requestedOwnerRevision)) return;
        if (result.ok && result.kind === "launch-subscription" && result.persisted === true) setWaitlisted(true);
        else setWaitlistError(!result.ok ? circlesSignupError(locale, result.error) : c("The signup result could not be confirmed. No payment was made."));
      } catch {
        if (!isCurrentOwner(requestedOwnerRevision)) return;
        setWaitlistError(c("The signup was interrupted. Your browser draft is unchanged. Check the request before retrying."));
      } finally { waitlistSubmitting.current = false; }
    });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.top}>
        <button type="button" className={styles.back} disabled={!hydrated} onClick={goBack}>
          {Ico.back({ size: 14, c: T.action })}{c("Back")}</button>
        <span className={styles.badge}>{c("Prototype · browser draft")}</span>
      </div>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{c("A future Circles concept")}</span>
          <h1>
            {savedDraft ? c("An idea worth keeping.") : c("Start with your cause.")}
          </h1>
          <p>
            {savedDraft
              ? draftPersisted ? c("Your complete draft is saved on this device.") : c("Your complete draft is ready in this screen, but not saved.")
              : c("Sketch the story. Nothing is published or charged.")}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/illustrations/giving.png" alt={c("People sharing a heart")} />
      </header>
      <Link href="/campaigns?mode=testnet" className={styles.liveLink}>
        <div>
          <strong>{isLocalPreview ? c("Explore a D4 example campaign instead") : c("Create a current Testnet campaign instead")}</strong>
          <span>
            {isLocalPreview ? c("Try fixed recipients and proof review with simulated escrow. No transactions or real funds.") : c("D4 campaigns use real Testnet escrow, fixed recipients and proof approval.")}
          </span>
        </div>
        {Ico.chev({ size: 18, c: T.action })}
      </Link>
      {!savedDraft ? (
        <>
          <div
            className={styles.stepLine}
            aria-label={c("Step {step} of 4: {label}", { step: step + 1, label: c(stepLabels[step]) })}
          >
            <strong>{step + 1} / 4</strong>
            {stepLabels.map((label, index) => (
              <span key={label} data-complete={index <= step} />
            ))}
            <strong>{c(stepLabels[step])}</strong>
          </div>
          <section className={styles.card} style={{ marginTop: 0 }}>
            <fieldset disabled={!hydrated} aria-busy={!hydrated} data-testid="circle-draft-fields"
              style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            {step === 0 && (
              <div className={styles.form}>
                <h2>{c("Tell us what matters.")}</h2>
                <label htmlFor="circle-draft-title" className={styles.field}>{c("Cause title")}<input
                    id="circle-draft-title"
                    className={styles.input}
                    maxLength={90}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={c("A library for our barangay")}
                  />
                  <span>{title.length}{" "}{c("/ 90 characters")}</span>
                </label>
                <label htmlFor="circle-draft-story" className={styles.field}>{c("The story")}<textarea
                    id="circle-draft-story"
                    className={styles.textarea}
                    rows={5}
                    maxLength={1500}
                    value={story}
                    onChange={(event) => setStory(event.target.value)}
                    placeholder={c("Who needs help, what will change, and how would you document it?")}
                  />
                  <span>
                    {story.length}{c("/ 1,500 characters. Use at least 40.")}</span>
                </label>
                <label htmlFor="circle-draft-category" className={styles.field}>{c("Category")}<select
                    id="circle-draft-category"
                    className={styles.select}
                    value={category}
                    onChange={(event) =>
                      changeCategory(event.target.value as CircleCategory)
                    }
                  >
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {circlesCategory(locale, item)}
                      </option>
                    ))}
                  </select>
                </label>
                <Btn kind="quiet" size="md" onClick={restoreDraft}>{c("Restore last browser draft")}</Btn>
              </div>
            )}
            {step === 1 && (
              <div className={styles.form}>
                <h2>{c("Give the idea a goal.")}</h2>
                <div className={styles.field}>
                  <label htmlFor="circle-draft-goal">{c("Example target ·")}{CURRENCY[currency].code}
                  </label>
                  <div
                    className={styles.amount}
                    style={{ marginTop: 0, background: "#f2f6fc" }}
                  >
                    <span>{CURRENCY[currency].symbol}</span>
                    <input
                      id="circle-draft-goal"
                      inputMode="decimal"
                      autoComplete="off"
                      value={displayTarget}
                      onChange={(event) =>
                        setTarget({
                          value: event.target.value.replace(/[^\d.]/g, ""),
                          currency,
                        })
                      }
                    />
                  </div>
                  <span>{c("The input and saved target use the same displayed currency. Any PHP equivalent is illustrative, not a payment instruction.")}</span>
                </div>
                <label htmlFor="circle-draft-duration" className={styles.field}>{c("Proposed funding period")}<select
                    id="circle-draft-duration"
                    className={styles.select}
                    value={durationDays}
                    onChange={(event) =>
                      setDurationDays(Number(event.target.value))
                    }
                  >
                    {[14, 30, 60, 90].map((days) => (
                      <option key={days} value={days}>
                        {days}{c("days")}</option>
                    ))}
                  </select>
                </label>
                <div className={styles.notice}>{c("There is no running deadline for this draft. The live D4 campaign creation form separately records funding and proof deadlines on-chain.")}</div>
              </div>
            )}
            {step === 2 && (
              <div className={styles.form}>
                <h2>{c("Make the concept yours.")}</h2>
                <label
                  htmlFor="circle-draft-allowance"
                  className={styles.field}
                >{c("Proposed organizer allowance")}<select
                    id="circle-draft-allowance"
                    className={styles.select}
                    value={allowancePct}
                    onChange={(event) => {
                      setAllowancePct(Number(event.target.value));
                      setAllowanceAck(false);
                    }}
                  >
                    {[0, 5, 10].map((percentage) => (
                      <option key={percentage} value={percentage}>
                        {percentage}{c("% for operations")}</option>
                    ))}
                  </select>
                  <span>{c("A future Circles feature. This draft does not verify an organizer or enforce an allowance.")}</span>
                </label>
                {allowancePct > 0 && (
                  <label className={styles.checks}>
                    <input
                      type="checkbox"
                      checked={allowanceAck}
                      onChange={(event) =>
                        setAllowanceAck(event.target.checked)
                      }
                    />{c("I understand this allowance is an illustration, not approved or withdrawable funds.")}</label>
                )}
                {renderGallery(gallery, true)}
                <div className={styles.notice}>{c("Organizer verification, reputation and dispute handling are proposed tools. This flow does not perform KYC, create a verification badge or generate public proof.")}</div>
              </div>
            )}
            {step === 3 && (
              <>
                <span className={styles.eyebrow}>{c("Review your browser draft")}</span>
                {renderGallery(gallery)}
                <h2 style={{ marginTop: 15 }}>{title}</h2>
                <p style={{ whiteSpace: "pre-wrap" }}>{story}</p>
                <dl className={styles.summaryList}>
                  <dt>{c("Category")}</dt>
                  <dd>{circlesCategory(locale, category)}</dd>
                  <dt>{c("Example target")}</dt>
                  <dd>
                    {formatLocalAmount(goal, currency)}{" "}
                    {CURRENCY[currency].code}
                  </dd>
                  <dt>{c("Proposed period")}</dt>
                  <dd>{durationDays}{" "}{c("days")}</dd>
                  <dt>{c("Proposed allowance")}</dt>
                  <dd>{allowancePct}%</dd>
                  <dt>{c("Organizer verification")}</dt>
                  <dd>{c("Not performed")}</dd>
                  <dt>{c("Publication")}</dt>
                  <dd>{c("Not published")}</dd>
                </dl>
                <label className={styles.checks} style={{ marginTop: 22 }}>
                  <input
                    type="checkbox"
                    checked={draftAck}
                    onChange={(event) => setDraftAck(event.target.checked)}
                  />{c("Save this concept on this device only. It is not a live campaign and will replace the last Circles browser draft.")}</label>
              </>
            )}
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
            {note && (
              <div
                className={styles.notice}
                role="status"
                style={{ marginTop: 15 }}
              >
                {note}
              </div>
            )}
            <div className={styles.nextRow}>
              {step > 0 && (
                <Btn
                  kind="secondary"
                  full={false}
                  onClick={() => {
                    setError("");
                    setStep((current) => (current - 1) as Step);
                  }}
                >{c("Back")}</Btn>
              )}
              <Btn
                onClick={step === 3 ? saveDraft : next}
                disabled={step === 3 && !draftAck}
              >
                {step === 3 ? c("Save complete browser draft") : c("Continue")}
              </Btn>
            </div>
            </fieldset>
          </section>
          <p
            className={styles.hint}
            style={{ marginTop: 16, textAlign: "center" }}
          >{c("No campaign URL is generated. Your text is not sent to Salapi.")}</p>
        </>
      ) : (
        <>
          <section className={styles.success} role="status">
            <strong>{draftPersisted ? c("Complete draft saved in this browser.") : c("Complete draft prepared, not saved.")}</strong>
            <p style={{ marginTop: 8 }}>
              {draftPersisted ? c("Title, story, category, target, currency, duration, three-photo gallery, cover and allowance preferences are included. Clearing browser data will remove it. It has not been published or uploaded.") : c("All draft fields are ready in memory. Leaving this page will lose the unsaved draft. Download a copy before leaving. It has not been published or uploaded.")}
            </p>
          </section>
          {error && <div className={styles.error} role="alert">{error}</div>}
          <section className={styles.card}>
            {renderGallery(savedDraft.gallery ?? [])}
            <h2 style={{ marginTop: 15 }}>{savedDraft.title}</h2>
            <p>
              {formatLocalAmount(
                Number(savedDraft.target.localValue),
                savedDraft.target.currency,
              )}{" "}
              {CURRENCY[savedDraft.target.currency].code} ·{" "}
              {c("{days} days · proposed {percent}% allowance", { days: savedDraft.durationDays, percent: savedDraft.allowance.percentage })}
            </p>
            <div className={styles.action}>
              <Btn kind="quiet" onClick={downloadDraft}>{c("Download draft JSON")}</Btn>
            </div>
            <div className={styles.action}>
              <Btn
                kind="secondary"
                disabled={waitlistPending}
                onClick={() => {
                  setSavedDraft(null);
                  setDraftPersisted(false);
                  setError("");
                }}
              >{c("Edit draft")}</Btn>
            </div>
          </section>
          <section className={styles.card} aria-label={c("Optional organizer launch signup")}>
            <span className={styles.eyebrow}>{isLocalPreview ? c("Local signup example") : c("Optional organizer signup")}</span>
            <h2>{c("Hear when Circles is ready.")}</h2>
            <p>{c("Separate from your browser draft. This does not publish the cause, perform verification, or move money.")}</p>
            {waitlisted ? <div className={styles.notice} role="status" style={{ marginTop: 14 }}>
              {isLocalPreview ? c("Local organizer signup example complete. No email was submitted or saved.") : c("Your organizer launch subscription is saved. Your draft is not published, and no campaign, donor badge or payment was created.")}
            </div> : <form className={styles.form} style={{ marginTop: 16 }} onSubmit={event => { event.preventDefault(); submitWaitlist(); }}>
              <CirclesSignupEmail identity={identity} email={email} onChange={setEmail} refresh={refreshIdentity} pending={waitlistPending} id="circle-organizer-launch-email" />
              <label className={styles.checks}><input type="checkbox" checked={waitlistAck} disabled={waitlistPending} onChange={event => setWaitlistAck(event.target.checked)} />
                {isLocalPreview ? c("Try the signup example locally. Do not send or save my email.") : c("Send my email and the draft title, goal and locale to Salapi for organizer launch updates.")}
              </label>
              {waitlistError && <div className={styles.error} role="alert">{waitlistError}</div>}
              <Btn type="submit" disabled={waitlistPending || !waitlistAck || (identity.status !== "verified" && (identity.status !== "guest" || !email.trim()))} loading={waitlistPending}>
                {isLocalPreview ? c("Try organizer signup locally") : c("Request organizer launch updates")}
              </Btn>
            </form>}
          </section>
          <Link href="/campaigns?mode=testnet" className={styles.primaryLink}>
            {isLocalPreview ? c("Go to D4 example campaigns") : c("Go to live Testnet campaigns")}
          </Link>
        </>
      )}
      <footer className={styles.footer}>
        <PoweredByStellar />
        <span>{c("Circles prototype · No real donations.")}</span>
      </footer>
    </div>
  );
}
