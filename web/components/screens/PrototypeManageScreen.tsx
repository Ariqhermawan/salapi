"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowRight, DotsThree, HandHeart, Megaphone, PencilSimple, Plus, ShieldCheck, SlidersHorizontal, X } from "@phosphor-icons/react";
import { AppBar, Btn, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { localPreviewCauses, type LocalPreviewCause } from "@/lib/local-preview";
import { RECURRING_CAMPAIGN_PREVIEW_NOTICE } from "@/lib/prototype-recurring-preview";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import { useGoBack } from "@/lib/ui/useGoBack";
import styles from "./PrototypeManageScreen.module.css";

type Mode = "list" | "hub" | "payout" | "sub";

export default function PrototypeManageScreen({ mode = "list", id = "mei", section = "" }: { mode?: Mode; id?: string; section?: string }) {
  const router = useRouter();
  const back = useGoBack(mode === "list" ? "/you" : mode === "sub" ? `/manage/${id}` : "/manage");
  const cause = PROTOTYPE_CAUSES.find(item => item.id === id) ?? PROTOTYPE_CAUSES.find(item => item.id === "mei")!;
  const [createdCauses, setCreatedCauses] = useState<LocalPreviewCause[]>([]);
  const [copied, setCopied] = useState(false);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftStory, setDraftStory] = useState("");
  const [draftGoal, setDraftGoal] = useState("");
  const [draftUpdate, setDraftUpdate] = useState("");
  const [updatePosted, setUpdatePosted] = useState(false);
  const [updateMediaCount, setUpdateMediaCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [openUpdateMenu, setOpenUpdateMenu] = useState<string | null>(null);
  const [removedUpdates, setRemovedUpdates] = useState<string[]>([]);
  const [proofName, setProofName] = useState("");
  const [proofOpen, setProofOpen] = useState(false);
  useEffect(() => setCreatedCauses(localPreviewCauses()), []);
  const createdCause = createdCauses.find(item => item.id === id);
  const raised = createdCause ? 0 : cause.raised;
  const goal = createdCause ? createdCause.targetCents : cause.target;
  const escrow = createdCause ? 0 : cause.escrowCents ?? (cause.status === "Released" ? 0 : raised);
  const title = createdCause?.title ?? (cause.id === "mei" ? "Ate Mei needs dialysis" : cause.title);
  const feePercent = createdCause?.organizerFeePercent ?? cause.organizerFeeBps / 100;
  const progress = goal > 0 ? Math.min(100, raised / goal * 100) : 0;
  const payoutStages = createdCause?.stages?.map(stage => ({ ...stage, status: "Waiting" as const, proofNote: undefined as string | undefined })) ?? cause.stages ?? [];
  const stageTurn = payoutStages.findIndex(stage => stage.status !== "Paid");
  const currentStage = stageTurn >= 0 ? payoutStages[stageTurn] : undefined;
  const stageRatings = cause.status === "In review" ? 2 : cause.status === "Released" ? 3 : 0;
  const stagedCause = payoutStages.length > 0;
  const stageDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(Number(value.slice(0, 4)) !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  const shortMoney = (cents: number) => (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sectionTitle: Record<string, string> = { edit: "Edit cause", goal: "Edit goal", updates: "Updates", "updates/new": "Post an update", donations: "Donations", settings: "Settings", proof: "Upload proof", release: "Claim benefit" };

  if (mode === "list") return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Your causes" />
    {createdCauses.length > 0 ? <section className={styles.createdList} aria-label="Your causes">{createdCauses.map(item => <button key={item.id} type="button" onClick={() => router.push(`/manage/${item.id}`)}>
      <span className={styles.causeIcon}><HandHeart size={20} /></span><span><strong>{item.title}</strong><small>$0.00 USDC raised</small></span><em>Local preview</em><ArrowRight size={18} />
    </button>)}<Btn kind="secondary" onClick={() => router.push("/create")}>Create cause</Btn></section> : <section className={styles.empty}>
      <Image src="/prototype-ui/empty-causes.png" width={196} height={128} alt="" priority unoptimized />
      <h1>No causes yet</h1>
      <p>Start one and manage it here.</p>
      <Btn size="md" full={false} onClick={() => router.push("/create")}>Create cause</Btn>
    </section>}
    <div className={styles.powered}><PoweredByStellar /></div>
  </div>;

  if (mode === "sub") return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title={id === "reading-zines" && (section === "edit" || section === "settings") ? "Edit cause" : sectionTitle[section] ?? "Manage cause"} />
    {id === "reading-zines" && section === "edit" ? <>
      <section className={styles.card}>
        <div className={styles.segmented}><button type="button" aria-current="page">Details</button><button type="button" onClick={() => router.push(`/manage/${id}/settings`)}>Settings</button></div>
        <p className={styles.endedMessage}>This cause has ended, so it can no longer be edited.</p>
        <div className={styles.endedRows}>
          <ReadonlyRow label="Title" value={cause.title} />
          <ReadonlyRow label="Story" value={cause.story ?? ""} />
          <ReadonlyRow label="Cover" value="1 photo" />
        </div>
      </section>
      <section className={styles.card}><h2>Terms</h2><div className={styles.endedRows}>
        <ReadonlyRow label="Target" value="$600.00" />
        <ReadonlyRow label="Payout" value="3 stages" />
        <ReadonlyRow label="Receives" value="@teachers_circle" />
        <ReadonlyRow label="Organizer fee" value="5%" />
        <ReadonlyRow label="Release" value="In stages, after each proof" />
      </div></section>
    </> : null}
    {section === "updates" ? <>
      <div className={styles.updatesIntro}><p>Updates show on your cause page and reach your donors as a notification.</p><Btn size="md" leading={<Plus size={17} />} onClick={() => router.push(`/manage/${id}/updates/new`)}>New update</Btn></div>
      {[{ heading: "Session 4 is done", text: "Mei is home and resting. Eight sessions to go.", time: "2 days ago" }, { heading: "First week of care", text: "Thank you to everyone who gave. The clinic has the schedule.", time: "1 week ago" }, { heading: "Clinic visit booked", text: "The first session is set for Monday.", time: "2 weeks ago" }].filter(item => !removedUpdates.includes(item.heading)).map(item => <section className={styles.updateCard} key={item.heading}>
        <header><div><h2>{item.heading}</h2><time>{item.time}</time></div><button className={styles.optionsButton} type="button" aria-label={`Options for ${item.heading}`} aria-expanded={openUpdateMenu === item.heading} onClick={() => setOpenUpdateMenu(openUpdateMenu === item.heading ? null : item.heading)}><DotsThree size={21} weight="bold" /></button></header>
        <p>{item.text}</p>
        {openUpdateMenu === item.heading && <div className={styles.updateMenu}><button type="button" onClick={() => router.push(`/manage/${id}/updates/new`)}>Edit update</button><button type="button" onClick={() => { setRemovedUpdates(current => [...current, item.heading]); setOpenUpdateMenu(null); }}>Delete update</button></div>}
      </section>)}
    </> : null}
    {section === "updates/new" ? <>
      <section className={styles.updateFormCard}>
        <label htmlFor="update-title">Title</label><input id="update-title" maxLength={60} value={draftTitle} onChange={event => setDraftTitle(event.target.value)} />
        <label htmlFor="update-story">Your update</label><textarea id="update-story" maxLength={500} value={draftUpdate} onChange={event => setDraftUpdate(event.target.value)} />
        <div className={styles.uploadLabel}>Photos and videos · {updateMediaCount} of 5</div><label className={styles.uploadTile} htmlFor="update-photo"><Plus size={17} /><span>Photo or video</span></label><input className={styles.hiddenFile} id="update-photo" type="file" accept="image/*,video/*" multiple onChange={event => setUpdateMediaCount(Math.min(event.target.files?.length ?? 0, 5))} />
        <p className={styles.formHint}>Donors get a notification when you post.</p>
      </section>
      <section className={styles.updateFormCard}><h2>Receipts</h2><p className={styles.receiptLabel}>Photos of what you paid for · {receiptCount} of 5</p><label className={styles.uploadTile} htmlFor="update-receipts"><Plus size={17} /><span>Photo</span></label><input className={styles.hiddenFile} id="update-receipts" type="file" accept="image/*" multiple onChange={event => setReceiptCount(Math.min(event.target.files?.length ?? 0, 5))} /><p className={styles.formHint}>Donors see receipts on the Proof tab. Cover card numbers and addresses before you take the photo.</p></section>
      <div className={styles.updateFormActions}><Btn disabled={!draftTitle.trim() || !draftUpdate.trim()} onClick={() => setUpdatePosted(true)}>{updatePosted ? "Saved locally" : "Post update"}</Btn></div>
    </> : null}
    {section === "donations" ? <>
      <div className={styles.donationStats}><article><span>Raised</span><strong>$862.07</strong></article><article><span>In escrow</span><strong>$862.07</strong></article></div>
      {[{ day: "Today", donors: [["@jamal_r", "9:41", "+$25.00"], ["@ana.reyes", "8:12", "+$5.00"]] }, { day: "Yesterday", donors: [["Anonymous", "16:20", "+$12.00"], ["@mika_t", "11:05", "+$50.00"]] }].map(group => <section className={styles.donationGroup} key={group.day}>
        <h2>{group.day}</h2><div className={styles.donationRows}>{group.donors.map(([name, time, amount]) => <article key={name}><span className={styles.donationIcon}><ArrowDownLeft size={17} /></span><span><strong>{name}</strong><small>{time}</small></span><b>{amount}</b></article>)}</div>
      </section>)}
    </> : null}
    {section === "edit" && id !== "reading-zines" ? <section className={styles.card}><div className={styles.segmented}><button type="button" aria-current="page">Details</button><button type="button" onClick={() => router.push(`/manage/${id}/settings`)}>Settings</button></div><h1>What donors see</h1><label htmlFor="manage-title">Cause title</label><input id="manage-title" maxLength={90} value={draftTitle || title} onChange={event => setDraftTitle(event.target.value)} /><label htmlFor="manage-story">The story</label><textarea id="manage-story" maxLength={1500} value={draftStory || cause.story || ""} onChange={event => setDraftStory(event.target.value)} />{stagedCause && <><div className={styles.stageTerms}><strong>Cause terms</strong><span>Target <b>${shortMoney(goal)}</b></span><span>Payout <b>{payoutStages.length} example stages</b></span><span>Release <b>Local preview only</b></span></div><p className={styles.stagePreviewNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p></>}<p className={styles.reason}>Local preview only. Changes are not published.</p><Btn onClick={() => setSaved(true)}>{saved ? "Saved locally" : "Save changes"}</Btn></section> : null}
    {section === "goal" ? stagedCause ? <section className={styles.card}><h1>Example goal</h1><p>These prototype stages add up to this example target.</p><div className={styles.stageTerms}><span>Target <b>${shortMoney(goal)}</b></span><span>Planned stages <b>{payoutStages.length}</b></span></div><p className={styles.stagePreviewNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p><Btn kind="secondary" onClick={() => router.push(`/manage/${id}/edit`)}>View cause terms</Btn></section> : <section className={styles.card}><h1>Goal & funding date</h1><label htmlFor="manage-goal">Goal amount · USD</label><input id="manage-goal" inputMode="decimal" value={draftGoal || shortMoney(goal)} onChange={event => setDraftGoal(event.target.value.replace(/[^0-9.]/g, ""))} /><small>You can change the goal after launch.</small><label htmlFor="manage-end-date">Funding ends on</label><input id="manage-end-date" type="date" defaultValue={createdCause?.endDate} /><p className={styles.reason}>Local preview only. The Testnet campaign goal is not changed.</p><Btn onClick={() => setSaved(true)}>{saved ? "Saved locally" : "Save changes"}</Btn></section> : null}
    {section === "settings" ? id === "reading-zines" ? <>
      <section className={styles.card}>
        <div className={styles.segmented}><button type="button" onClick={() => router.push(`/manage/${id}/edit`)}>Details</button><button type="button" aria-current="page">Settings</button></div>
        <div className={styles.endedSettings}>
          <div><span><strong>Accept donations</strong><small>Donors can give to this cause.</small></span><span className={styles.endedToggle} aria-hidden="true" /></div>
          <div><span><strong>Appear in search</strong><small>The cause appears in lists and search.</small></span><span className={styles.endedToggle} aria-hidden="true" /></div>
        </div>
      </section>
      <section className={styles.endedNotice}><h2>End this cause</h2><p>This cause has ended. Money in escrow still follows the payout steps.</p></section>
      <div className={styles.endedDoodle} aria-hidden="true"><Image src="/prototype-causes/doodle-people.png" alt="" width={240} height={240} /></div>
    </> : <section className={styles.card}><div className={styles.segmented}><button type="button" onClick={() => router.push(`/manage/${id}/edit`)}>Details</button><button type="button" aria-current="page">Settings</button></div><h1>Cause settings</h1><button className={styles.settingRow} type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}><span><strong>{paused ? "Resume donations" : "Pause donations"}</strong><small>{paused ? "Donors cannot give while paused." : "Temporarily stop new donations."}</small></span><span className={styles.toggle} data-on={paused || undefined} /></button><button className={styles.settingRow} type="button" onClick={() => setSaved(true)}><span><strong>End this cause</strong><small>Close donations and keep the payout steps.</small></span><ArrowRight size={18} /></button><p className={styles.reason}>{saved ? "This change is only saved in the local preview." : "Settings in this preview do not change a Testnet campaign."}</p></section> : null}
    {section === "proof" ? stagedCause ? <section className={styles.card}><h1>Example proof</h1><p className={styles.stagePreviewNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p><p>Proof upload and stage review are not available in this local recurring schedule preview.</p></section> : <section className={styles.card}><h1>Show what the funds did.</h1><p>Upload proof after the goal is reached or the deadline passes.</p><label htmlFor="proof-note">What did you deliver?</label><textarea id="proof-note" placeholder="Describe how the funds helped" /><label htmlFor="proof-file">Receipt or photo</label><input id="proof-file" type="file" accept="image/*,.pdf" onChange={event => setProofName(event.target.files?.[0]?.name ?? "")} />{proofName && <small>{proofName}</small>}<p className={styles.reason}>This local preview does not upload proof or open a contract transaction.</p><Btn disabled={!proofName}>Save proof locally</Btn></section> : null}
    {section === "release" ? stagedCause ? <section className={styles.card}><h1>Example payout</h1><p className={styles.stagePreviewNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p><p>Stage claims and escrow releases are not available in this local recurring schedule preview.</p></section> : <section className={styles.card}><h1>Claim your benefit</h1><p>Funds stay in escrow until the proof is reviewed and the identity check is complete.</p><div className={styles.stats}><article><span>Your benefit</span><strong>${shortMoney(Math.round(raised * feePercent / 100))}</strong></article><article><span>In escrow</span><strong>${shortMoney(escrow)}</strong></article></div><p className={styles.reason}>Complete the proof and donor review steps before claiming.</p><Btn disabled>Claim your benefit</Btn></section> : null}
    {section !== "updates" && section !== "updates/new" && !(id === "reading-zines" && (section === "edit" || section === "settings")) && <div className={styles.powered}><PoweredByStellar /></div>}
  </div>;

  if (mode === "payout") return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Payout" />
    <section className={styles.card}>
      <h1>{cause.shortTitle ?? title}</h1>
      <div className={styles.stats}>
        <article><span>Raised</span><strong>${shortMoney(raised)}</strong></article>
        <article><span>Your benefit</span><strong>${shortMoney(Math.round(raised * feePercent / 100))}</strong><small>{feePercent === 0 ? "You take no fee on this cause" : `${feePercent}% of what is raised`}</small></article>
      </div>
      {(cause.releasedCents ?? 0) > 0 && <p className={styles.releasedSummary}>${shortMoney(cause.releasedCents ?? 0)} released so far · ${shortMoney(escrow)} in escrow</p>}
    </section>
    {stagedCause && <section className={styles.card}>
      <h2>Example stage schedule</h2><p className={styles.stagePreviewNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p>
      <ol className={styles.stageList}>{payoutStages.map((stage, index) => <li className={`${stage.status === "Paid" ? styles.stagePaid : stage.status === "In review" ? styles.stageReview : ""}`} key={stage.title}>
        <span className={styles.stageIndex}>{index + 1}</span><span><strong>{stage.title}</strong><small>{stage.status === "Paid" ? `Example · $${shortMoney(stage.paidCents ?? stage.amountCents)} · ${stage.paidOn ?? "Paid today"}` : `Example · $${shortMoney(stage.amountCents)} · Due ${stageDate(stage.dueDate)}`}</small>{stage.status === "In review" && <small>Illustrative review activity only.</small>}</span>
        <em>Example · {stage.status}</em>
      </li>)}</ol>
    </section>}
    {stagedCause ? <section className={styles.card}><h2>Recurring payout preview</h2><p className={styles.stagePreviewNotice} role="note">{RECURRING_CAMPAIGN_PREVIEW_NOTICE}</p><p>Proof submission, reviewer decisions, stage claims and escrow releases are unavailable for this local schedule fixture.</p></section> : <section className={styles.card}>
      <h2>Payout steps</h2>
      <p>Funds stay in escrow until every step is done.</p>
      <ol className={styles.steps}>
        {["Proof uploaded", "Donor ratings", "Benefit claimed"].map((name, index) => <li key={name}><span className={styles.stepNumber}>{index + 1}</span><span className={styles.stepInfo}><strong>{name}</strong>{index === 0 ? <small>After the goal is reached or the deadline passes.</small> : index === 1 ? <small>3 ratings minimum, from donors.</small> : null}</span><em>Waiting</em></li>)}
      </ol>
      <div className={styles.note}><div className={styles.noteHeading}><strong>Identity check (KYC)</strong><em>Not verified</em></div><small>Needed before the first payout. It takes a few minutes.</small><button type="button" onClick={() => router.push("/you/verify/preview")}>Verify</button></div>
      {cause.status === "In review" ? <Btn kind="secondary" onClick={() => setProofOpen(true)}>View proof</Btn> : <Btn kind="secondary" disabled={cause.status === "Funding" || !currentStage}>Upload proof</Btn>}
      <Btn kind="secondary" disabled>Claim your benefit</Btn>
      <small className={styles.reason}>Proof opens after the goal is reached or the deadline passes.</small>
    </section>}
    <div className={styles.powered}><PoweredByStellar /></div>
    {proofOpen && <div className={styles.proofBackdrop} role="presentation" onClick={event => { if (event.target === event.currentTarget) setProofOpen(false); }}><section className={styles.proofSheet} role="dialog" aria-modal="true" aria-labelledby="manage-proof-title"><div className={styles.proofHandle} /><header><h2 id="manage-proof-title">Proof of delivery</h2><button type="button" aria-label="Close" onClick={() => setProofOpen(false)}><X size={18} /></button></header>{currentStage?.proofNote && <p>{currentStage.proofNote}</p>}<dl><div><dt>Uploaded</dt><dd>Today</dd></div><div><dt>Rated by</dt><dd>{stageRatings} of 3 donors</dd></div><div><dt>Status</dt><dd>Waiting for ratings</dd></div></dl><button className={styles.proofClose} type="button" onClick={() => setProofOpen(false)}>Close</button></section></div>}
  </div>;

  const share = async () => {
    const link = `${window.location.origin}/cause/${cause.id}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
    catch { setCopied(false); }
  };
  const rows = [
    { title: "Edit cause", sub: "You can edit the title, goal, story and photos for 15 minutes after you launch your cause.", detail: "Closed 15 minutes after launch", icon: PencilSimple, path: "edit" },
    { title: "Updates", sub: "Post news for your donors", icon: Megaphone, path: "updates" },
    { title: "Donations", sub: "See who gave and how much", icon: HandHeart, path: "donations" },
    { title: "Payout", sub: "Proof, review and release", icon: ShieldCheck, path: "payout" },
    { title: "Settings", sub: "Turn donations off or end the cause", icon: SlidersHorizontal, path: "settings" },
  ];
  return <div className={styles.screen}>
    <AppBar leading={<IconButton ariaLabel="Back" onClick={back}>{Ico.back({})}</IconButton>} title="Manage cause" />
    <section className={styles.card}>
      <h1>{title}</h1><p className={styles.live}>{createdCause ? "Local preview · not published" : "Live"}</p>
      <div className={styles.goalLine}><strong>Goal</strong><strong>{shortMoney(goal)} USDC</strong></div>
      <div className={styles.progress}><span style={{ width: `${progress}%` }} /></div>
      <p className={styles.progressLabel}>{progress.toFixed(2)}% of goal · {shortMoney(raised)} USDC raised</p>
    </section>
    <div className={styles.share}><Btn onClick={() => void share()}>{copied ? "Copied" : "Share"}</Btn></div>
    <section className={styles.rows} aria-label="Cause management">
      {rows.map(({ title, sub, detail, icon: Icon, path }) => <button key={path} type="button" onClick={() => router.push(`/manage/${id}/${path}`)}>
        <span className={styles.rowIcon}><Icon size={19} weight="regular" /></span><span className={styles.rowCopy}><strong>{title}</strong><small>{sub}</small>{detail && <small>{detail}</small>}</span><ArrowRight size={18} className={styles.arrow} />
      </button>)}
    </section>
    <div className={styles.powered}><PoweredByStellar /></div>
  </div>;
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return <div className={styles.endedRow}><span>{label}</span><strong>{value}</strong></div>;
}
