"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppBar, Btn, Ico, IconButton, T } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import { isLocalPreview } from "@/lib/local-preview";
import { formatFundingXlm, parseFundingXlm, fundingReview, type FundingRoomState, type FundingJoinReview, type FundingDepositReview, type FundingDays, type FundingOperationReview, type FundingCreateReview, type FundingCadence } from "@/lib/arisan-funding";
import { MAX_FUNDING_FEE_XLM, MAX_FUNDING_FEE_STROOPS } from "@/lib/arisan-funding-fees";
import { fundingCreate as submitCreate, fundingList, fundingState, fundingResolveCode, fundingRecoverCreate, fundingJoin, fundingDeposit, fundingStart as submitStart, fundingLeave as submitLeave, fundingCancel as submitCancel, fundingCommit as submitCommit, fundingReveal as submitReveal, fundingFinalize as submitFinalize } from "@/app/arisan-funding-actions";
import ArisanFundingReminder from "./ArisanFundingReminder";
import { FUNDING_PREVIEW_ACTORS, previewFundingCreate, FUNDING_PREVIEW_CONTRACT, previewFundingList, previewFundingState, previewFundingResolve, previewFundingMutate, previewFundingActor, savePreviewFundingActor } from "./arisan-funding-preview";
import styles from "./ArisanFundingScreen.module.css";

type Mutation = { ok: true; id?: number; hash?: string; link?: string } | { ok: false; error: string; pending?: boolean; hash?: string; link?: string };
const xlm = (value: string) => `${formatFundingXlm(value)} XLM`;
const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-6)}`;
const timing = (seconds: number) => seconds % 86400 === 0 ? `${seconds / 86400} day(s)` : seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`;
const PREVIEW_TIMING = { cadenceSecs: { Weekly: 60, Biweekly: 120, Monthly: 300 }, firstCommitWindow: 300 };
const when = (value: number) => new Date(value * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function ArisanFundingScreen({ roomId }: { roomId?: number }) {
  const router = useRouter();
  const goBack = useGoBack(roomId ? "/arisan/funding" : "/arisan");
  const submission = useUnresolvedSubmission("arisan:installment-rooms");
  const createSubmission = useUnresolvedSubmission("arisan:installment-create", { keepSuccessLocked: true });
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const request = useRef({ version: 0 });
  const [actor, setActor] = useState(0);
  const viewer = FUNDING_PREVIEW_ACTORS[actor];
  const [room, setRoom] = useState<FundingRoomState | null>(null);
  const [rooms, setRooms] = useState<FundingRoomState[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [receiptLink, setReceiptLink] = useState("");
  const [creatorIdentity, setCreatorIdentity] = useState<{ contractId: string; viewer: string | null; cadenceSecs: Record<FundingCadence, number>; firstCommitWindow: number } | null>(null);
  const [clock, setClock] = useState(0);
  const [name, setName] = useState("");
  const [members, setMembers] = useState(3);
  const [share, setShare] = useState("1");
  const [cadence, setCadence] = useState<"Weekly" | "Biweekly" | "Monthly">("Weekly");
  const [days, setDaysValue] = useState<FundingDays>(7);
  const [code, setCode] = useState("");
  const [invitation, setInvitation] = useState<{ room: FundingRoomState; review: FundingJoinReview } | null>(null);
  const [amount, setAmount] = useState("");
  const [depositReview, setDepositReview] = useState<FundingDepositReview | null>(null);
  const [createReviewed, setCreateReviewedValue] = useState<FundingCreateReview | null>(null);
  const busy = pending || submission.locked || createSubmission.locked;
  function setCreateReviewed(value: boolean) {
    if (!value) { setCreateReviewedValue(null); return; }
    if (!creatorIdentity?.viewer || readFailed || loading) return;
    setCreateReviewedValue({ contractId: creatorIdentity.contractId, expectedViewer: creatorIdentity.viewer, name: name.trim(), memberTarget: members, shareXlm: share, cadence, fundingDays: days });
  }
  function setDays(value: number) {
    if ([1,3,7,14,30].includes(value)) setDaysValue(value as FundingDays);
  }
  const roomTerms = room ? fundingReview(room) : null;
  const operationReview = roomTerms && room ? { ...roomTerms, round: room.round } : null;
  function reviewedOperation(id: number, action: (review: FundingOperationReview) => Promise<Mutation>) {
    return operationReview && id === operationReview.roomId ? action(operationReview) : Promise.resolve({ ok: false as const, error: "The current wallet and room terms could not be reviewed. Refresh and sign in again." });
  }
  const fundingStart = (id: number) => reviewedOperation(id, submitStart);
  const fundingLeave = (id: number) => reviewedOperation(id, submitLeave);
  const fundingCancel = (id: number) => reviewedOperation(id, submitCancel);
  const fundingCommit = (id: number) => reviewedOperation(id, submitCommit);
  const fundingReveal = (id: number) => reviewedOperation(id, submitReveal);
  const fundingFinalize = (id: number) => reviewedOperation(id, submitFinalize);
  const fundingCreate = () => createReviewed ? submitCreate(createReviewed) : Promise.resolve({ ok: false as const, error: "Review the room and creator wallet again." });

  const load = useCallback(async (cursor?: number) => {
    const token = ++request.current.version;
    setLoading(true);
    try {
      if (roomId) {
        const result = isLocalPreview ? previewFundingState(roomId, viewer) : await fundingState(roomId);
        if (!mounted.current || token !== request.current.version) return;
        if (!result.ready) throw new Error(result.error);
        setRoom(result);
        setDepositReview(previous => previous && result.status === "Open" && previous.viewer === result.viewer && previous.paidBeforeStroops === result.seats.find(seat => seat.isYou)?.paidStroops ? previous : null);
      } else {
        if (isLocalPreview) { setRooms(previewFundingList(viewer)); setNextCursor(null); setCreatorIdentity({ contractId: FUNDING_PREVIEW_CONTRACT, viewer, ...PREVIEW_TIMING }); }
        else {
          const result = await fundingList(cursor);
          if (!mounted.current || token !== request.current.version) return;
          if (!result.ready) throw new Error(result.error);
          setRooms(previous => cursor ? [...new Map([...previous, ...result.rooms].map(row => [row.id, row])).values()] : result.rooms);
          setNextCursor(result.nextCursor);
          setCreatorIdentity({ contractId: result.contractId, viewer: result.viewer, cadenceSecs: result.cadenceSecs, firstCommitWindow: result.firstCommitWindow });
          setCreateReviewedValue(previous => previous && previous.contractId === result.contractId && previous.expectedViewer === result.viewer ? previous : null);
        }
      }
      if (!mounted.current || token !== request.current.version) return;
      setReadFailed(false); setError(""); setClock(Math.floor(Date.now()/1000));
    } catch (reason) {
      if (mounted.current && token === request.current.version) { setReadFailed(true); setError(reason instanceof Error ? reason.message : "Room state could not be verified. Refresh before continuing."); }
    } finally { if (mounted.current && token === request.current.version) setLoading(false); }
  }, [roomId, viewer]);
  useEffect(() => {
    mounted.current = true;
    const pendingReads = request.current;
    const timer = setTimeout(() => {
      try {
        if (isLocalPreview && previewFundingActor() !== actor) { setActor(previewFundingActor()); return; }
        void load();
      } catch { setReadFailed(true); setLoading(false); setError("Local storage is unavailable. No local membership or funding was changed."); }
    }, 0);
    return () => { mounted.current = false; pendingReads.version++; clearTimeout(timer); };
  }, [load, actor]);
  useEffect(() => {
    const timer = setInterval(() => { setClock(Math.floor(Date.now()/1000)); }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!roomId || isLocalPreview) return;
    const timer = setInterval(() => { if (!inFlight.current && document.visibilityState === "visible") void load(); }, 15000);
    return () => clearInterval(timer);
  }, [roomId, load]);

  function act(label: string, action: () => Promise<Mutation> | Mutation, destination?: boolean) {
    if (inFlight.current || submission.locked || createSubmission.locked || !mounted.current) return;
    const guard = label === "Creating without deposit" ? createSubmission : submission;
    inFlight.current = true; setError(""); setNotice(""); setReceiptLink(""); setDepositReview(null);
    start(async () => {
      try {
        const result = isLocalPreview ? await action() : await guard.run(async () => action());
        if (!mounted.current || !result) return;
        if (!result.ok) { setError(result.error); return; }
        if (!isLocalPreview && guard === createSubmission && result.id && result.hash && !createSubmission.clearVerified(result.hash)) {
          setError("The room was created, but its retry safeguard could not be cleared. Open the original room; do not create again.");
          router.push(`/arisan/funding/${result.id}`); return;
        }
        setNotice(isLocalPreview ? `${label} completed locally. No tokens moved.` : `${label} confirmed on Stellar Testnet.`);
        setReceiptLink(result.link ?? ""); setInvitation(null); setAmount(""); setCreateReviewedValue(null);
        if (destination && result.id) router.push(`/arisan/funding/${result.id}`);
        else await load();
      } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "The result is unknown. Check the original transaction before retrying."); }
      finally { inFlight.current = false; }
    });
  }
  function recoverCreatedRoom() {
    if (inFlight.current || pending || createSubmission.checking || !mounted.current) return;
    const hash = createSubmission.state.kind === "locked" ? createSubmission.state.record.hash : null;
    if (!hash) { void load(); return; }
    inFlight.current = true; setError(""); setNotice("");
    start(async () => {
      try {
        // This is a read-only recovery. It never runs through the submission
        // action, decrypts a signer or creates another room.
        const result = await fundingRecoverCreate(hash);
        if (!mounted.current) return;
        if (!result.ok) { setError(result.error); return; }
        if (result.hash !== hash || !createSubmission.clearVerified(hash)) {
          setError("The original room was verified, but the browser safeguard could not be cleared. Do not create again.");
          return;
        }
        setCreateReviewedValue(null);
        setReceiptLink(result.link);
        setNotice("The original creation receipt and creator wallet were verified. No transaction was resubmitted.");
        if (roomId === result.id) await load();
        else router.push(`/arisan/funding/${result.id}`);
      } catch {
        if (mounted.current) setError("The original creation receipt is still unresolved. No transaction was resubmitted.");
      } finally { inFlight.current = false; }
    });
  }
  function reviewInvite() {
    if (inFlight.current || submission.locked || createSubmission.locked || readFailed || loading) return;
    inFlight.current = true; setInvitation(null); setError("");
    start(async () => {
      try {
        const result = isLocalPreview ? previewFundingResolve(code.trim().toUpperCase(), viewer) : await fundingResolveCode(code);
        if (!mounted.current) return;
        if (!result.ok) { setError(result.error); return; }
        if (!result.room.ready || !result.review) { setError("Sign in with your saved wallet to review and join this room."); return; }
        setInvitation({ room: result.room, review: result.review });
      } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : "Invitation could not be verified."); }
      finally { inFlight.current = false; }
    });
  }
  function changeActor(value: number) {
    if (busy) return;
    try { savePreviewFundingActor(value); } catch { setError("The local actor could not be saved. No account switch occurred."); return; }
    setInvitation(null); setDepositReview(null); setCreateReviewedValue(null); setAmount(""); setNotice(""); setRoom(null); setCreatorIdentity(null); setActor(value);
  }
  const mine = room?.seats.find(seat => seat.isYou);
  const expired = !!room && clock >= room.fundingDeadline;
  const allowed = !busy && !readFailed && !loading;
  const obligation = parseFundingXlm(share);
  const cycleObligation = obligation ? xlm((BigInt(obligation)*BigInt(members)).toString()) : "Enter a valid share";
  const parsedAmount = parseFundingXlm(amount);
  const amountIsAllowed = !!parsedAmount && !!mine && BigInt(parsedAmount)<=BigInt(mine.remainingStroops);
  const fundedPercent = mine && room ? Number(BigInt(mine.paidStroops)*100n/BigInt(room.obligationStroops)) : 0;
  const remainingAfterReview = mine && depositReview ? xlm((BigInt(mine.remainingStroops)-BigInt(depositReview.amountStroops)).toString()) : "Unavailable";
  const maximumDebit = depositReview ? xlm((BigInt(depositReview.amountStroops) + BigInt(MAX_FUNDING_FEE_STROOPS)).toString()) : "Unavailable";
  function presetIsAllowed(value: string) { return !!mine && BigInt(parseFundingXlm(value)!)<=BigInt(mine.remainingStroops); }
  function reviewCurrentDeposit() {
    if (!roomTerms || !mine || !parsedAmount || !amountIsAllowed) return;
    setDepositReview({ ...roomTerms, paidBeforeStroops: mine.paidStroops, amountStroops: parsedAmount });
  }

  return <div className={styles.screen} style={{ fontFamily: T.fontSans }}>
    <AppBar title={room ? room.name : "Arisan · Pay in steps"} leading={<IconButton ariaLabel="Back to arisan" onClick={goBack}>{Ico.back({})}</IconButton>} />
    <div className={styles.body}>
      <SubmissionStatusPanel guard={submission} onRefresh={() => load()} />
      <SubmissionStatusPanel guard={createSubmission} onRefresh={recoverCreatedRoom} />
      {isLocalPreview && <section className={styles.demo}><strong>Local interaction test only</strong><p>These three wallets are test doubles, not Gmail sessions. No balance or blockchain transaction changes.</p><label className={styles.field}>Try as member<select value={actor} onChange={event => changeActor(Number(event.target.value))} disabled={busy}>{FUNDING_PREVIEW_ACTORS.map((address, index) => <option key={address} value={index}>QA member {index+1} · {short(address)}</option>)}</select></label></section>}
      <header className={styles.hero}><span className={styles.eyebrow}>STELLAR TESTNET · INSTALLMENT PREFUNDING</span><h1>{roomId ? !room ? "Verify this circle first." : room.status === "Open" ? "Join first. Fund at your pace." : room.status === "Dissolved" ? "Circle cancelled. Contributions returned." : room.status === "Done" ? "Your circle, completed." : "Your circle, fully funded." : "A seat today. A little at a time."}</h1><p>Join does not charge a deposit. Pay in smaller amounts before the funding deadline. Start is available only after every member is fully funded.</p><div className={styles.steps}><span>1. Join</span><span>2. Add funds</span><span>3. All paid</span><span>4. Start</span></div></header>
      <p className={styles.disclosure}>Testnet XLM only, no monetary value. Each member owes exactly N × the agreed share. No automatic debit, interest or yield. Existing full-deposit rooms remain separate.</p>
      <aside className={styles.card} aria-label="Testnet transaction fee limit"><h2>Network fee: at most {MAX_FUNDING_FEE_XLM} Testnet XLM per transaction</h2><p>On live Testnet, create, join, contribute, Start, refund and draw actions each need a separate network transaction. The server refuses to sign if its total fee exceeds this limit.</p><p>This is a maximum, not a fixed charge. A refundable resource allowance is included within the limit; unused allowance is returned by Stellar. Actual charged fees are separate from your contribution and are not refunded when you leave or cancel.</p></aside>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.success} role="status">{notice}</p>}
      {receiptLink && <a href={receiptLink} target="_blank" rel="noopener noreferrer" className={styles.refresh}>View the confirmed transaction on Stellar</a>}
      <button type="button" className={styles.refresh} onClick={() => { if (!busy) void load(); }} disabled={busy || loading}>{loading ? "Checking room state..." : "Refresh verified state"}</button>
      {!roomId && <>
        <section className={styles.card}><h2>Join an invited circle</h2><label className={styles.field}>Invite code<input value={code} maxLength={6} autoCapitalize="characters" spellCheck={false} onChange={event => { setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,"")); setInvitation(null); }} disabled={busy} /></label><Btn onClick={reviewInvite} disabled={busy || readFailed || loading || !/^[A-HJ-NP-Z2-9]{6}$/.test(code)}>Review invitation</Btn>
          {invitation && <div className={styles.review}><h3>{invitation.room.name}</h3><dl><dt>Contribution at join</dt><dd>0 XLM deposit</dd><dt>Maximum network fee</dt><dd>{MAX_FUNDING_FEE_XLM} Testnet XLM</dd><dt>Maximum wallet debit at join</dt><dd>{MAX_FUNDING_FEE_XLM} Testnet XLM, fee only</dd><dt>Fixed total obligation</dt><dd>{xlm(invitation.review.obligationStroops)}</dd><dt>Share per round</dt><dd>{xlm(invitation.review.shareStroops)}</dd><dt>Funding deadline</dt><dd>{when(invitation.review.fundingDeadline)}</dd><dt>Seats</dt><dd>{invitation.room.memberCount}/{invitation.room.memberTarget}</dd></dl><p>Join accepts these fixed terms without taking a contribution. On live Testnet it still pays a network fee, up to the server limit above. Actual contributions are refundable before Start; charged network fees are not.</p><Btn disabled={busy || !invitation.room.canJoin || clock >= invitation.review.fundingDeadline} onClick={() => act("Joining without deposit", () => isLocalPreview ? previewFundingMutate(invitation.room.id, viewer, "join", invitation.review) : fundingJoin(invitation.review), true)}>Accept terms and join without deposit</Btn></div>}
        </section>
        <section className={styles.card}><h2>Create a circle</h2><label className={styles.field}>Room name<input value={name} maxLength={40} onChange={event => { setName(event.target.value); setCreateReviewed(false); }} disabled={busy} /></label><div className={styles.grid}><label className={styles.field}>Members<select value={members} onChange={event => { setMembers(Number(event.target.value)); setCreateReviewed(false); }} disabled={busy}>{Array.from({ length: 18 }, (_, index) => index+3).map(value => <option key={value}>{value}</option>)}</select></label><label className={styles.field}>Share per round (XLM)<input value={share} inputMode="decimal" onChange={event => { setShare(event.target.value); setCreateReviewed(false); }} disabled={busy} /></label><label className={styles.field}>Funding window<select value={days} onChange={event => { setDays(Number(event.target.value)); setCreateReviewed(false); }} disabled={busy}>{[1,3,7,14,30].map(value => <option key={value} value={value}>{value} day{value>1 ? "s" : ""}</option>)}</select></label><label className={styles.field}>Round cadence<select value={cadence} onChange={event => { setCadence(event.target.value as typeof cadence); setCreateReviewed(false); }} disabled={busy}><option value="Weekly">Weekly · {creatorIdentity ? timing(creatorIdentity.cadenceSecs.Weekly) : "Not verified"}</option><option value="Biweekly">Every 2 weeks · {creatorIdentity ? timing(creatorIdentity.cadenceSecs.Biweekly) : "Not verified"}</option><option value="Monthly">Monthly · {creatorIdentity ? timing(creatorIdentity.cadenceSecs.Monthly) : "Not verified"}</option></select></label></div>
          <p className={styles.disclosure}>Your total obligation: {cycleObligation}. Creating the room seats you at 0 deposited. The first draw starts its countdown only after Start. Actual timing comes from this contract, not the cadence name.</p>
          {createReviewed ? <div className={styles.review}><h3>Review fixed room terms</h3><p>{createReviewed.name} · {createReviewed.memberTarget} members · {createReviewed.shareXlm} XLM each round · {createReviewed.fundingDays} days to fund.</p><p>Verified round interval: {creatorIdentity ? timing(creatorIdentity.cadenceSecs[createReviewed.cadence]) : "Unavailable"}. First commit window after Start: {creatorIdentity ? timing(creatorIdentity.firstCommitWindow) : "Unavailable"}.</p><dl><dt>Contribution at creation</dt><dd>0 XLM</dd><dt>Maximum network fee</dt><dd>{MAX_FUNDING_FEE_XLM} Testnet XLM</dd><dt>Maximum wallet debit at creation</dt><dd>{MAX_FUNDING_FEE_XLM} Testnet XLM, fee only</dd></dl><p>Every member must pay their full cycle obligation before the host can Start. Cancel returns actual contributions, not unpaid amounts. Charged network fees are not refundable.</p><Btn disabled={busy || readFailed || loading || !creatorIdentity?.viewer} onClick={() => act("Creating without deposit", () => isLocalPreview ? previewFundingCreate({ name, memberTarget: members, shareStroops: obligation!, cadence, fundingDays: days }, viewer) : fundingCreate(), true)}>Confirm room without deposit</Btn><button type="button" className={styles.refresh} disabled={busy} onClick={() => setCreateReviewed(false)}>Edit terms</button></div> : <Btn disabled={busy || readFailed || loading || !creatorIdentity?.viewer || !name.trim() || !obligation} onClick={() => setCreateReviewed(true)}>Review room terms</Btn>}
        </section>
        <section className={styles.card}><h2>Your installment rooms</h2>{!loading && !readFailed && rooms.length === 0 && <p>No joined installment rooms on this page yet.</p>}{rooms.map(current => <Link className={styles.roomLink} key={`${current.contractId}:${current.id}`} href={`/arisan/funding/${current.id}`}><strong>{current.name}</strong><span>{current.status} · {current.memberCount}/{current.memberTarget} joined · {current.fullyFundedCount}/{current.memberTarget} fully funded</span></Link>)}{nextCursor !== null && <Btn kind="secondary" disabled={busy || loading} onClick={() => { void load(nextCursor); }}>Load older rooms</Btn>}</section>
        <Link href="/arisan" className={styles.refresh}>View existing full-deposit rooms</Link>
      </>}
      {roomId && room && <>
        <section className={styles.card}><div className={styles.sectionTitle}><h2>{room.status === "Open" ? "Funding progress" : room.status === "Active" ? `Round ${room.round} of ${room.memberTarget}` : room.status === "Done" ? "Cycle completed" : "Cancelled and refunded"}</h2><span className={styles.badge}>{room.status}</span></div><div className={styles.grid}><div className={styles.metric}><small>Members joined</small><strong>{room.memberCount}/{room.memberTarget}</strong></div><div className={styles.metric}><small>Fully funded</small><strong>{room.fullyFundedCount}/{room.memberTarget}</strong></div><div className={styles.metric}><small>Total obligation per member</small><strong>{xlm(room.obligationStroops)}</strong></div><div className={styles.metric}><small>Room pool remaining</small><strong>{xlm(room.pooledStroops)}</strong></div></div><p>Funding deadline: <strong>{when(room.fundingDeadline)}</strong></p>{room.code && <p>Invite code: <strong className={styles.code}>{room.code}</strong></p>}{room.status === "Open" && expired && <p className={styles.error}>Funding is closed. Do not send more. The host, or any caller after the deadline, can cancel to refund actual contributions.</p>}</section>
        {mine && <section className={styles.card}><h2>Your contribution</h2><dl className={styles.amounts}><dt>Already deposited</dt><dd>{xlm(mine.paidStroops)}</dd><dt>{room.status === "Dissolved" ? "Remaining due (cancelled)" : "Remaining before Start"}</dt><dd>{room.status === "Dissolved" ? "0 XLM" : xlm(mine.remainingStroops)}</dd></dl><progress max="100" value={fundedPercent} aria-label="Your funding progress" />{room.status === "Open" && !mine.fullyFunded && !expired && <><label className={styles.field}>Add any amount up to your remaining XLM<input value={amount} inputMode="decimal" disabled={!allowed} onChange={event => { setAmount(event.target.value); setDepositReview(null); }} /></label><div className={styles.presets}>{["0.1","0.5","1"].map(value => <button type="button" key={value} disabled={!allowed || !presetIsAllowed(value)} onClick={() => { setAmount(value); setDepositReview(null); }}>{value} XLM</button>)}<button type="button" disabled={!allowed} onClick={() => { setAmount(formatFundingXlm(mine.remainingStroops)); setDepositReview(null); }}>Pay remaining</button></div>{depositReview ? <div className={styles.review}><h3>Confirm this contribution</h3><dl><dt>Contribution to the room</dt><dd>{xlm(depositReview.amountStroops)}</dd><dt>Maximum network fee</dt><dd>{MAX_FUNDING_FEE_XLM} Testnet XLM</dd><dt>Maximum wallet debit</dt><dd>{maximumDebit}, including fee</dd><dt>Remaining contribution after</dt><dd>{remainingAfterReview}</dd></dl><p>On live Testnet, the network fee is separate from your contribution and bounded by the server limit. Unused refundable allowance is returned by Stellar. No recurring or automatic payment is authorized.</p><Btn disabled={!allowed || !room.canDeposit} onClick={() => act("Contribution", () => isLocalPreview ? previewFundingMutate(room.id, viewer, "deposit", depositReview) : fundingDeposit(depositReview))}>Confirm contribution of {xlm(depositReview.amountStroops)}</Btn></div> : <Btn disabled={!allowed || !room.canDeposit || !amountIsAllowed} onClick={reviewCurrentDeposit}>Review contribution</Btn>}</>}{mine.fullyFunded && <p className={styles.success}>Fully funded. No further payment is required for this cycle.</p>}{room.viewer && <ArisanFundingReminder contractId={room.contractId} roomId={room.id} viewer={room.viewer} deadline={room.fundingDeadline} remainingStroops={mine.remainingStroops} status={room.status} />}</section>}
        <section className={styles.card}><h2>Members and funding</h2>{room.seats.map((seat, index) => <div key={seat.addr} className={styles.member}><div><strong>{seat.isYou ? "You" : isLocalPreview ? `QA member ${FUNDING_PREVIEW_ACTORS.indexOf(seat.addr)+1}` : `Member ${index+1}`}{seat.addr===room.host ? " · Host" : ""}</strong><span className={styles.address}>{seat.addr}</span></div><div><span className={seat.fullyFunded ? styles.paid : styles.unpaid}>{room.status === "Dissolved" ? "Refunded" : seat.fullyFunded ? "Fully funded" : "Not fully funded"}</span><small>{xlm(seat.paidStroops)} deposited</small>{room.status === "Open" && <small>{xlm(seat.remainingStroops)} remaining</small>}</div></div>)}</section>
        {room.status === "Open" && <section className={styles.card}><h2>Start only when everyone is ready</h2><p>{room.memberTarget-room.memberCount} seat(s) still open. {room.memberTarget-room.fullyFundedCount} member(s) still need to finish funding.</p>{room.isHost ? <Btn disabled={!allowed || !room.readyToStart || expired} onClick={() => { if (window.confirm("Start this fully funded cycle? Members and terms are locked after Start.")) act("Starting cycle", () => isLocalPreview ? previewFundingMutate(room.id, viewer, "start") : fundingStart(room.id)); }}>Start fully funded arisan</Btn> : <p>The verified host can Start once every member is fully funded.</p>}{room.canLeave && <Btn kind="secondary" disabled={!allowed} onClick={() => { if (window.confirm(`Leave and refund your actual contribution of ${xlm(mine!.paidStroops)}? Network fees are not refunded.`)) act("Leaving and refund", () => isLocalPreview ? previewFundingMutate(room.id, viewer, "leave") : fundingLeave(room.id)); }}>Leave and refund {mine ? xlm(mine.paidStroops) : "contribution"}</Btn>}{room.canCancel && <Btn kind="secondary" disabled={!allowed} onClick={() => { if (window.confirm("Cancel this room and return all actual contributions?")) act("Cancellation and refunds", () => isLocalPreview ? previewFundingMutate(room.id, viewer, "cancel") : fundingCancel(room.id)); }}>Cancel room and refund contributions</Btn>}</section>}
        {room.status === "Active" && <section className={styles.card}><h2>Next draw action</h2><p>{room.drawPhase} phase · {room.commitCount} committed · {room.revealCount} revealed</p><p>Round interval: {timing(room.cadenceSecs)}, read from this contract.</p><p>Commit closes {when(room.commitAt)}. Reveal closes {when(room.revealAt)}. Already-funded members do not pay again.</p>{room.canCommit && <Btn disabled={!allowed} onClick={() => act("Draw commitment", () => fundingCommit(room.id))}>Commit for this round</Btn>}{room.canReveal && <Btn disabled={!allowed} onClick={() => act("Draw reveal", () => fundingReveal(room.id))}>Reveal for this round</Btn>}{room.canFinalize && <Btn disabled={!allowed} onClick={() => act("Draw payout", () => isLocalPreview ? previewFundingMutate(room.id, viewer, "finalize") : fundingFinalize(room.id))}>{isLocalPreview ? "Simulate next payout locally" : "Finalize draw and payout"}</Btn>}<p className={styles.disclosure}>Testnet draw protocol uses commit/reveal. A no-reveal fallback is predictable, not a guaranteed fair random draw. Do not use this candidate with real money.</p></section>}
        {room.winners.length > 0 && <section className={styles.card}><h2>Payout history</h2>{room.winners.map(winner => <div key={winner.round} className={styles.member}><div><strong>Round {winner.round}</strong><span className={styles.address}>{winner.addr}</span></div><div><span className={styles.paid}>Paid {xlm(room.obligationStroops)}</span></div></div>)}<p className={styles.disclosure}>{isLocalPreview ? "Local simulated payouts, not blockchain receipts." : "Confirmed winner records read from this room's contract. The pool funds one payout per member."}</p></section>}
        {!room.isMember && <p className={styles.disclosure}>This wallet is not a member. Join through the reviewed invitation, not by sending XLM directly to the contract.</p>}
      </>}
    </div>
  </div>;
}
