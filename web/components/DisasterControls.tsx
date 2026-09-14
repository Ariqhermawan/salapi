"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { disasterApprove, disasterEvents, disasterExecute, disasterProposals, disasterPropose, type disasterState } from "@/app/disaster-actions";
import { formatStroops, parseDisasterAction } from "@/lib/disaster";
import { useT } from "@/components/I18nProvider";
import { CURRENCY } from "@/lib/ui/currency";
import { Btn, Card, T } from "@/components/ui/kit";

type Pool = Awaited<ReturnType<typeof disasterState>>;
type Proposals = Awaited<ReturnType<typeof disasterProposals>>;
type EventFeed = Awaited<ReturnType<typeof disasterEvents>>;
type Review = { method: "propose"; input: unknown; summary: string }
  | { method: "approve" | "execute"; id: string; summary: string };
const inputStyle: CSSProperties = { width: "100%", padding: 11, border: `1px solid ${T.hairline}`,
  borderRadius: 10, background: T.surface, color: T.ink, fontSize: 14, boxSizing: "border-box" };
const small: CSSProperties = { fontSize: 12, color: T.slate, lineHeight: 1.55 };

export default function DisasterControls({ pool, onRefresh }: { pool: Pool | null; onRefresh: () => Promise<void> }) {
  const { currency } = useT();
  const [list, setList] = useState<Proposals | null>(null);
  const [feed, setFeed] = useState<EventFeed | null>(null);
  const [before, setBefore] = useState("0");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const contractId = pool?.ok ? pool.contractId : null;

  const refresh = useCallback(async () => {
    if (!contractId) return;
    try {
      const [proposals, events] = await Promise.all([disasterProposals(before), disasterEvents()]);
      setList(proposals); setFeed(events);
    } catch {
      setList({ ok: false, error: "Connection lost. Refresh before taking any signer action." });
    }
  }, [contractId, before]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { void refresh(); void onRefresh(); }, 10_000);
    return () => clearInterval(interval);
  }, [refresh, onRefresh]);

  async function confirm() {
    if (!review || busy) return;
    setBusy(true); setError(""); setReceipt(null);
    try {
      const result = review.method === "propose" ? await disasterPropose(review.input)
        : review.method === "approve" ? await disasterApprove(review.id) : await disasterExecute(review.id);
      if (!result.ok) setError(result.error);
      else { setReceipt(result.link); setReview(null); }
      await Promise.all([refresh(), onRefresh()]);
    } catch {
      setError("Connection interrupted. Refresh and check the proposal before retrying; the transaction may have been submitted.");
    } finally { setBusy(false); }
  }

  if (!pool || !pool.ok) return (
    <section aria-label="Disaster Vault controls" style={{ padding: "12px 16px 0" }}>
      <Card p={14}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Disaster Vault · 2-of-3 controls</h2>
        <p role="status" style={small}>{pool ? pool.error : "Reading verified contract configuration…"}</p>
        <p style={small}>Signer controls are unavailable until the configured D3 contract is verified.</p>
      </Card>
    </section>
  );

  const viewer = list?.ok ? list.viewer : null;
  const member = viewer !== null && pool.config.signers.includes(viewer);
  const state = pool.status;

  return (
    <section aria-label="Disaster Vault controls" style={{ padding: "12px 16px 0", display: "grid", gap: 12 }}>
      <Card p={14}>
        <h2 style={{ margin: 0, fontSize: 17 }}>Disaster Vault · 2-of-3 controls</h2>
        <p style={small}>Three fixed signers. Two separate approvals for payouts, pause, and unpause. Testnet only.</p>
        <dl style={{ fontSize: 13, display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <dt>Payout status</dt><dd style={{ margin: 0 }}>{state.paused ? "Paused" : "Active"}</dd>
          <dt>Executed in last 24h</dt><dd style={{ margin: 0 }}>{formatStroops(state.spent_24h)} XLM</dd>
          <dt>20% of current balance</dt><dd style={{ margin: 0 }}>{formatStroops(state.cap)} XLM</dd>
          <dt>Remaining allowance now</dt><dd style={{ margin: 0 }}>{formatStroops(state.allowance)} XLM</dd>
        </dl>
        <p style={small}>Payouts wait {pool.config.timelock_ledgers} ledgers after the second approval. The cap is rechecked at execution; it is not reserved when a proposal is approved. Donations remain open while paused.</p>
        <details>
          <summary style={{ fontSize: 13, cursor: "pointer" }}>View the three fixed signers</summary>
          <ol style={{ paddingLeft: 18, ...small }}>
            {pool.config.signers.map((s, i) => <li key={s} style={{ paddingTop: 8 }}>
              Signer {i + 1}{s === viewer ? " · your wallet" : ""}
              <a href={`https://stellar.expert/explorer/testnet/account/${s}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "block", color: T.action, overflowWrap: "anywhere", fontFamily: T.fontMono }}>{s}</a>
            </li>)}
          </ol>
        </details>
        <p style={small}>Current wallets are custodial Testnet wallets. This is contract-level approval control, not independent key custody or an external audit.</p>
      </Card>

      {member ? <Card p={14}>
        <h3 style={{ fontSize: 15, margin: "0 0 12px" }}>Create a payout proposal</h3>
        <form onSubmit={e => {
          e.preventDefault(); setError("");
          const input = { kind: "Disburse", recipient, money: { amount, currency } };
          try {
            const action = parseDisasterAction(input);
            if (action[0] === "Disburse") setReview({ method: "propose", input,
              summary: `Send ${formatStroops(action[2])} Testnet XLM to ${action[1]}. Creating the proposal does not approve or transfer funds.` });
          } catch (err) { setError(err instanceof Error ? err.message : "Invalid proposal"); }
        }} style={{ display: "grid", gap: 10 }}>
          <label style={small}>Recipient wallet (G…)
            <input aria-label="Recipient wallet" value={recipient} onChange={e => setRecipient(e.target.value)}
              autoCapitalize="off" autoComplete="off" spellCheck={false} required disabled={busy} style={inputStyle} />
          </label>
          <label style={small}>Amount ({CURRENCY[currency].code}, illustrative Testnet rate)
            <input aria-label="Payout amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              required disabled={busy} style={inputStyle} />
          </label>
          <button type="submit" disabled={busy} style={{ ...inputStyle, background: T.action, color: "white", cursor: "pointer" }}>Review payout proposal</button>
        </form>
        <div style={{ marginTop: 12 }}>
          <Btn kind="secondary" size="sm" disabled={busy} onClick={() => setReview({ method: "propose",
            input: { kind: state.paused ? "Unpause" : "Pause" },
            summary: `${state.paused ? "Unpause" : "Pause"} payouts. This needs two distinct approvals; control actions have no payout timelock.` })}>
            Propose {state.paused ? "unpause" : "pause"}
          </Btn>
        </div>
      </Card> : <Card p={14}>
        <p style={{ ...small, margin: 0 }}>Public read-only view. Only one of the three configured signer wallets can propose, approve, or execute.</p>
        {!viewer && <Link href="/signin?next=%2Ftransparency" style={{ display: "inline-block", marginTop: 10, color: T.action }}>Sign in for signer controls</Link>}
      </Card>}

      {review && <Card p={14}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Confirm {review.method}</h3>
        <p style={{ ...small, overflowWrap: "anywhere" }}>{review.summary}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn size="sm" disabled={busy || !member} loading={busy} onClick={confirm}>Confirm {review.method}</Btn>
          <Btn kind="ghost" size="sm" disabled={busy} onClick={() => setReview(null)}>Cancel</Btn>
        </div>
      </Card>}
      {error && <p role="alert" style={{ ...small, color: T.danger, overflowWrap: "anywhere" }}>{error}</p>}
      {receipt && <p role="status" style={small}>Transaction confirmed. <a href={receipt} target="_blank" rel="noopener noreferrer" style={{ color: T.action }}>View on Stellar Expert</a></p>}

      <Card p={14}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>On-chain proposals</h3>
          <Btn kind="ghost" size="sm" full={false} disabled={busy} onClick={async () => { await Promise.all([refresh(), onRefresh()]); }}>Refresh</Btn>
        </div>
        {!list ? <p style={small}>Loading proposals…</p> : !list.ok ? <p role="alert" style={small}>{list.error}</p>
          : list.proposals.length === 0 ? <p style={small}>No proposals yet.</p> : list.proposals.map(p => {
            const remaining = p.readyLedger === null ? null : Math.max(0, p.readyLedger - state.ledger);
            const stale = p.kind !== "Disburse" && p.epoch !== state.epoch;
            const canExecute = !p.executed && !stale && p.approvals.length >= 2 && remaining === 0
              && (p.kind !== "Disburse" || (!state.paused && BigInt(p.amount!) <= BigInt(state.allowance)));
            const summary = `Proposal #${p.id}: ${p.kind}${p.amount ? ` ${formatStroops(p.amount)} Testnet XLM to ${p.recipient}` : ""}.`;
            return <article key={p.id} style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 12, marginTop: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14 }}>#{p.id} · {p.kind}</h4>
              {p.amount && <p style={{ ...small, overflowWrap: "anywhere" }}>{formatStroops(p.amount)} XLM → {p.recipient}</p>}
              <p style={small}>{p.approvals.length}/3 approvals · {p.executed ? "Executed" : stale ? "Stale control proposal"
                : remaining === null ? "Awaiting two approvals" : remaining > 0 ? `Wait ${remaining} ledgers`
                : p.kind === "Disburse" && state.paused ? "Blocked: payouts paused"
                : p.kind === "Disburse" && BigInt(p.amount!) > BigInt(state.allowance) ? "Blocked: exceeds current allowance" : "Ready to execute"}</p>
              <p style={small}>Approved by: {p.approvals.length ? p.approvals.map(a => `Signer ${pool.config.signers.indexOf(a) + 1}`).join(", ") : "none"}</p>
              {member && !p.executed && !stale && <div style={{ display: "flex", gap: 8 }}>
                <Btn size="sm" kind="secondary" disabled={busy || p.approvals.includes(viewer!)} onClick={() => setReview({ method: "approve", id: p.id, summary })}>Approve #{p.id}</Btn>
                <Btn size="sm" disabled={busy || !canExecute} onClick={() => setReview({ method: "execute", id: p.id, summary })}>Execute #{p.id}</Btn>
              </div>}
            </article>;
          })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {before !== "0" && <Btn kind="ghost" size="sm" disabled={busy} onClick={() => setBefore("0")}>Newest proposals</Btn>}
          {list?.ok && list.proposals.length > 0 && BigInt(list.proposals.at(-1)!.id) > 1n
            && <Btn kind="ghost" size="sm" disabled={busy} onClick={() => setBefore(list.proposals.at(-1)!.id)}>Earlier proposals</Btn>}
        </div>
      </Card>

      <Card p={14}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Recent D3 transactions</h3>
        <p style={small}>Up to 100 events from the last 720 ledgers. Historical evidence is retained in the D3 report.</p>
        {!feed ? <p style={small}>Loading events…</p> : !feed.ok ? <p style={small}>{feed.error}</p>
          : feed.events.length === 0 ? <p style={small}>No events in this window.</p>
          : feed.events.map(e => <p key={e.id} style={small}>
            <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: T.action }}>{e.action} · ledger {e.ledger} · {e.hash.slice(0, 12)}…</a>
          </p>)}
        <a href={`https://stellar.expert/explorer/testnet/contract/${pool.contractId}`} target="_blank" rel="noopener noreferrer"
          style={{ ...small, color: T.action, overflowWrap: "anywhere", display: "block" }}>Active D3 contract: {pool.contractId}</a>
      </Card>
    </section>
  );
}
