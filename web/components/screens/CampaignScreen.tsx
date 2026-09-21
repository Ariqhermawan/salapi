"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AppBar, Btn, Card, T, TestnetPill } from "@/components/ui/kit";
import { campaignApprove, campaignCloseEmpty, campaignCreate, campaignDonate, campaignEvents, campaignRefund,
  campaignRelease, campaignState, campaignSubmitProof } from "@/app/campaign-actions";
import { campaignAmount, campaignSplit, creatorCutBps } from "@/lib/campaign-money";
import { formatStroops } from "@/lib/disaster";
import { publicProofUrl, type Campaign } from "@/lib/campaign";

const field: CSSProperties = { width: "100%", border: `1px solid ${T.hairline}`, borderRadius: 10, padding: 10, fontSize: 14, background: "white", boxSizing: "border-box" };
const group: CSSProperties = { display: "grid", gap: 10 };
const wordBreak: CSSProperties = { overflowWrap: "anywhere", fontFamily: T.fontMono, fontSize: 11 };
const stamp = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleString();
const safeProof = (url: string) => { try { return publicProofUrl(url); } catch { return null; } };
type State = Awaited<ReturnType<typeof campaignState>>;
type Result = Awaited<ReturnType<typeof campaignCreate>>;
type Run = (label: string, action: () => Promise<Result>, created?: boolean) => void;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: "grid", gap: 4, fontSize: 13 }}>{label}{children}</label>;
}
function AddressLink({ address }: { address: string }) {
  return <a style={wordBreak} href={`https://stellar.expert/explorer/testnet/account/${address}`} target="_blank" rel="noreferrer">{address}</a>;
}

function CreateCampaign({ run, busy }: { run: Run; busy: boolean }) {
  const [values, setValues] = useState({ title: "", beneficiary: "", creatorCut: "5", funding: "", review: "", a: "", b: "", c: "" });
  const [error, setError] = useState("");
  const input = (key: keyof typeof values, label: string, type = "text") => <Field label={label}><input style={field} type={type}
    value={values[key]} onChange={e => setValues({ ...values, [key]: e.target.value })} disabled={busy} step={type === "datetime-local" ? "1" : undefined} /></Field>;
  function submit() {
    try {
      setError("");
      creatorCutBps(values.creatorCut);
      const fundingDeadline = String(new Date(values.funding).getTime() / 1000);
      const reviewDeadline = String(new Date(values.review).getTime() / 1000);
      if (!values.title.trim() || !/^\d+$/.test(fundingDeadline) || !/^\d+$/.test(reviewDeadline)) throw new Error("Enter a title and both deadlines");
      run(`Create “${values.title}” with a ${values.creatorCut}% creator share. Funding closes ${new Date(values.funding).toLocaleString()}; review closes ${new Date(values.review).toLocaleString()}. The three approvers, recipients, share and deadlines cannot be changed.`,
        () => campaignCreate({ title: values.title, beneficiary: values.beneficiary, creatorCut: values.creatorCut,
          fundingDeadline, reviewDeadline, approvers: [values.a, values.b, values.c] }), true);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid campaign"); }
  }
  return <details><summary style={{ fontWeight: 700, cursor: "pointer", padding: "8px 0" }}>Create a Testnet campaign</summary>
    <div style={group}>
      <p style={{ fontSize: 12 }}>All terms lock at creation. Choose three different approver wallets. The creator share is not a platform fee. All deadlines use your local timezone.</p>
      {input("title", "Campaign title")}{input("beneficiary", "Beneficiary wallet")}{input("creatorCut", "Creator share (%)")}
      {input("funding", "Funding deadline", "datetime-local")}{input("review", "Review deadline", "datetime-local")}
      {input("a", "Approver 1 wallet")}{input("b", "Approver 2 wallet")}{input("c", "Approver 3 wallet")}
      {error && <p role="alert">{error}</p>}<Btn disabled={busy} onClick={submit}>Review campaign creation</Btn>
    </div>
  </details>;
}

function CampaignCard({ c, viewer, now, run, busy }: { c: Campaign; viewer: string | null; now: bigint; run: Run; busy: boolean }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("XLM");
  const [hash, setHash] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const active = c.state === "Funding" || c.state === "PendingProof" || c.state === "Refundable";
  const fundingOpen = c.state === "Funding" && now < BigInt(c.config.funding_deadline);
  const reviewOpen = now >= BigInt(c.config.funding_deadline) && now < BigInt(c.config.review_deadline);
  const quorum = c.approvals.length >= 2;
  const refundOpen = active && now >= BigInt(c.config.review_deadline) && !quorum;
  const split = campaignSplit(BigInt(c.total), BigInt(c.config.creator_cut_bps));
  const status = refundOpen ? (c.total === "0" ? "Ready to close" : "Refund available")
    : c.state === "Funding" && !fundingOpen ? "Awaiting proof" : c.state;
  function donate() {
    try {
      setError(""); const stroops = campaignAmount({ amount, currency });
      run(`Donate ${formatStroops(stroops)} Testnet XLM to campaign #${c.id}. Funds remain escrowed pending proof review.`, () => campaignDonate(c.id, { amount, currency }));
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid amount"); }
  }
  return <section aria-label={`Campaign #${c.id}`}><Card><div style={group}>
    <div><Link href={`/campaigns?id=${c.id}`}><h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{c.title}</h2></Link>
      <p style={{ fontSize: 12 }}>Campaign #{c.id} · <strong>{status}</strong></p></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <div><small>Total donated</small><div>{formatStroops(c.total)} XLM</div></div>
      <div><small>Remaining escrow</small><div>{formatStroops(c.escrow)} XLM</div></div>
    </div>
    <p style={{ fontSize: 12 }}>If released: {formatStroops(split.creator)} XLM to creator ({c.config.creator_cut_bps / 100}%), {formatStroops(split.beneficiary)} XLM to beneficiary. Refunds return the full recorded donation.</p>
    <details><summary>View locked campaign terms</summary><div style={{ ...group, marginTop: 8 }}>
      <div>Creator<br /><AddressLink address={c.config.creator} /></div>
      <div>Beneficiary<br /><AddressLink address={c.config.beneficiary} /></div>
      <div style={{ fontSize: 12 }}>Funding closes: {stamp(c.config.funding_deadline)}<br />Review closes: {stamp(c.config.review_deadline)}</div>
      <div style={wordBreak}>Token: {c.config.token}</div>
      {c.config.approvers.map((address, i) => <div key={address}>Approver {i + 1}: {c.approvals.includes(address) ? "Approved" : "Not approved"}<br /><AddressLink address={address} /></div>)}
    </div></details>
    <div><strong>{c.approvals.length}/3 approvals</strong><p style={{ fontSize: 12 }}>Two different configured wallets must approve the same proof before the review deadline.</p></div>
    {c.proofHash && <div><h3>Submitted proof</h3>{safeProof(c.proofUrl) && <a href={safeProof(c.proofUrl)!} target="_blank" rel="noreferrer">Open public proof document</a>}
      <p style={wordBreak}>SHA-256: {c.proofHash}</p><small>A hash identifies the document; it does not verify that its claims are true.</small></div>}
    {viewer && <p style={{ fontSize: 13 }}>Your recorded donation: {formatStroops(c.contribution.amount)} XLM{c.contribution.refunded ? " · Refunded" : ""}</p>}
    {viewer && fundingOpen && <div style={group}>
      <Field label="Donation amount"><input style={field} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} /></Field>
      <Field label="Donation display currency"><select style={field} value={currency} onChange={e => setCurrency(e.target.value)} disabled={busy}><option value="XLM">Testnet XLM</option><option value="tl">PHP (illustrative)</option><option value="id">IDR (illustrative)</option></select></Field>
      <small>Only valueless Testnet XLM moves. Currency displays do not represent a fiat payment.</small>
      <Btn disabled={busy} onClick={donate}>Review donation</Btn>
    </div>}
    {viewer === c.config.creator && c.state === "Funding" && reviewOpen && <div style={group}>
      <h3>Submit proof once</h3>
      <Field label="Public proof URL"><input style={field} type="url" value={url} onChange={e => setUrl(e.target.value)} disabled={busy} /></Field>
      <Field label="Proof SHA-256"><input style={field} value={hash} onChange={e => setHash(e.target.value)} maxLength={64} disabled={busy} /></Field>
      <Field label="Calculate hash from proof file (optional)"><input type="file" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setError("Proof file must be under 10 MB"); return; }
        const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
        setHash(Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join(""));
      }} /></Field>
      <small>The file stays on this device. Publish it separately and supply its public HTTPS link. Do not include private information.</small>
      <Btn disabled={busy} onClick={() => run(`Submit proof ${hash} for campaign #${c.id}. It cannot be replaced.`, () => campaignSubmitProof(c.id, hash, url))}>Review proof submission</Btn>
    </div>}
    {viewer && c.config.approvers.includes(viewer) && c.state === "PendingProof" && reviewOpen && <Btn disabled={busy || c.approvals.includes(viewer)}
      onClick={() => run(`Approve the submitted proof ${c.proofHash} for campaign #${c.id}. Confirm you have reviewed the document.`, () => campaignApprove(c.id, c.proofHash!))}>Approve proof</Btn>}
    {viewer && c.state === "PendingProof" && quorum && <Btn disabled={busy} onClick={() => run(`Release campaign #${c.id}: ${formatStroops(split.creator)} XLM to creator and ${formatStroops(split.beneficiary)} XLM to beneficiary. This completes the campaign.`, () => campaignRelease(c.id))}>Release funds</Btn>}
    {viewer && refundOpen && BigInt(c.contribution.amount) > 0n && !c.contribution.refunded && <Btn disabled={busy} onClick={() => run(`Return your full ${formatStroops(c.contribution.amount)} XLM donation from campaign #${c.id} to your original wallet.`, () => campaignRefund(c.id))}>Claim full refund</Btn>}
    {viewer && refundOpen && c.total === "0" && <Btn kind="secondary" disabled={busy} onClick={() => run(`Close empty campaign #${c.id}.`, () => campaignCloseEmpty(c.id))}>Close empty campaign</Btn>}
    {error && <p role="alert">{error}</p>}
  </div></Card></section>;
}

export function CampaignEvidence() {
  const [events, setEvents] = useState<Awaited<ReturnType<typeof campaignEvents>> | null>(null);
  useEffect(() => { void campaignEvents().then(setEvents).catch(() => setEvents({ ok: false, error: "Recent events unavailable" })); }, []);
  return <section aria-label="Donation campaign transparency" style={{ padding: 16 }}><Card>
    <h2 style={{ fontWeight: 700 }}>Donation campaign transactions</h2><Link href="/campaigns">Open Testnet campaigns</Link>
    <p style={{ fontSize: 12 }}>Recent successful on-chain events (bounded live feed).</p>
    {!events && <p>Loading campaign events…</p>}
    {events && !events.ok && <p>{events.error}</p>}
    {events?.ok && events.events.length === 0 && <p>No campaign events in the recent window.</p>}
    {events?.ok && events.events.map(e => <div key={e.id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.hairline}` }}>
      <a href={e.link} target="_blank" rel="noreferrer">Campaign #{e.campaignId} · {e.action}</a><div style={wordBreak}>{e.hash}</div>
    </div>)}
  </Card></section>;
}

export default function CampaignScreen({ id }: { id: string }) {
  const [state, setState] = useState<State | null>(null);
  const [before, setBefore] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ link: string; id?: string } | null>(null);
  const [confirm, setConfirm] = useState<{ label: string; action: () => Promise<Result>; created?: boolean } | null>(null);
  const refresh = useCallback(async () => {
    try { setState(await campaignState(id, before)); }
    catch { setState({ ok: false, error: "Could not read campaign state. Refresh to retry." }); }
  }, [id, before]);
  useEffect(() => { void refresh(); const interval = setInterval(() => { void refresh(); }, 15000); return () => clearInterval(interval); }, [refresh]);
  const run: Run = (label, action, created) => { setDone(null); setError(""); setConfirm({ label, action, created }); };
  async function execute() {
    if (!confirm || busy) return;
    setBusy(true); setError("");
    try {
      const result = await confirm.action();
      if (!result.ok) setError(result.error);
      else { setDone({ link: result.link, id: confirm.created ? result.value : undefined }); setConfirm(null); await refresh(); }
    } catch { setError("Confirmation interrupted. Refresh and check campaign state before retrying."); }
    finally { setBusy(false); }
  }
  return <div style={{ fontFamily: T.fontSans, color: T.ink, paddingBottom: 36 }}>
    <AppBar title="Donation campaigns" leading={<Link href="/">Home</Link>} trailing={<TestnetPill />} />
    <div style={{ padding: 16, ...group }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Give with clear rules.</h1>
      <p>Funds stay in escrow until two reviewers approve the proof. Missed review? Donors can claim their full contribution back.</p>
      <p style={{ fontSize: 12 }}>Testnet only · No real money · Managed Salapi wallets</p>
      <div style={{ display: "flex", gap: 16 }}><Link href="/transparency">Transparency</Link>{id && <Link href="/campaigns">All campaigns</Link>}<button onClick={() => void refresh()} disabled={busy}>Refresh state</button></div>
      {!state && <p>Loading campaigns…</p>}
      {state && !state.ok && <p role="alert">{state.error}</p>}
      {state?.ok && <>
        <details><summary>Active D4 contract</summary><a style={wordBreak} href={`https://stellar.expert/explorer/testnet/contract/${state.contractId}`} target="_blank" rel="noreferrer">{state.contractId}</a></details>
        {state.viewer ? <Card><p style={{ fontSize: 12 }}>Signed-in wallet</p><AddressLink address={state.viewer} /><CreateCampaign run={run} busy={busy} /></Card>
          : <Card><p>Public read-only view. Sign in to create, donate, approve, or claim a refund.</p><Link href={`/signin?next=${encodeURIComponent(`/campaigns${id ? `?id=${id}` : ""}`)}`}>Sign in for campaign actions</Link></Card>}
        {state.campaigns.length === 0 && <p>No campaigns on this page yet.</p>}
        {state.campaigns.map(c => <CampaignCard key={c.id} c={c} now={BigInt(state.now)} viewer={state.viewer} busy={busy || !!confirm} run={run} />)}
        {!id && <div style={{ display: "flex", gap: 12 }}>{before !== "0" && <button onClick={() => setBefore("0")}>Newest campaigns</button>}
          {state.campaigns.length === 10 && <button onClick={() => setBefore(state.campaigns.at(-1)!.id)}>Older campaigns</button>}</div>}
      </>}
      {done && <div role="status"><p>Transaction confirmed. <a href={done.link} target="_blank" rel="noreferrer">View transaction</a></p>{done.id && <Link href={`/campaigns?id=${done.id}`}>Open created campaign #{done.id}</Link>}</div>}
      {error && <p role="alert" style={{ color: T.danger }}>{error}</p>}
    </div>
    {confirm && <div role="dialog" aria-modal="true" aria-label="Confirm campaign transaction" style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(11,18,32,.55)", display: "grid", placeItems: "center", padding: 20 }}>
      <Card style={{ maxWidth: 420, width: "100%" }}><div style={group}><h2>Confirm Testnet transaction</h2><p style={{ overflowWrap: "anywhere" }}>{confirm.label}</p>
        {error && <p role="alert">{error}</p>}<Btn disabled={busy} loading={busy} onClick={() => void execute()}>{busy ? "Confirming…" : "Confirm transaction"}</Btn>
        <Btn kind="secondary" disabled={busy} onClick={() => { setConfirm(null); setError(""); }}>Cancel</Btn>
      </div></Card>
    </div>}
  </div>;
}
