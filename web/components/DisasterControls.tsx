"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  disasterApprove,
  disasterEvents,
  disasterExecute,
  disasterProposals,
  disasterPropose,
  type disasterState,
} from "@/app/disaster-actions";
import { formatStroops, parseDisasterAction } from "@/lib/disaster";
import { useT } from "@/components/I18nProvider";
import { CURRENCY } from "@/lib/ui/currency";
import { Btn, Ico, T } from "@/components/ui/kit";
import styles from "./screens/VaultsRevamp.module.css";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";

type Pool = Awaited<ReturnType<typeof disasterState>>;
type Proposals = Awaited<ReturnType<typeof disasterProposals>>;
type EventFeed = Awaited<ReturnType<typeof disasterEvents>>;
type Review =
  | { method: "propose"; input: unknown; summary: string }
  | { method: "approve" | "execute"; id: string; summary: string };
type Tab = "overview" | "requests" | "proof";
const PREVIEW = process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1";
const REPORT =
  "https://github.com/Ariqhermawan/salapi/blob/98a4a701b3fbd6d71a55c346c06d76c0001bc37e/docs/instawards/week-3-d3.md";
const ARCHIVED_PAYOUT =
  "https://stellar.expert/explorer/testnet/tx/4559f41883fdc0a0e4fefa7e5bb16c19c26683768cbffaaf10edf9019d7eb0ac";

export default function DisasterControls({
  pool,
  onRefresh,
  publicProof,
}: {
  pool: Pool | null;
  onRefresh: () => Promise<void>;
  publicProof?: ReactNode;
}) {
  const submission = useUnresolvedSubmission("disaster:d3");
  const { currency } = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const [list, setList] = useState<Proposals | null>(null);
  const [feed, setFeed] = useState<EventFeed | null>(null);
  const [before, setBefore] = useState("0");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [submittingBusy, setBusy] = useState(false);
  const busy = submittingBusy || submission.locked;
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const contractId = pool?.ok ? pool.contractId : null;
  const refresh = useCallback(async () => {
    if (!contractId) return;
    if (PREVIEW) {
      setList({
        ok: true,
        viewer: null,
        proposals: [
          {
            id: "2",
            proposer: "",
            kind: "Disburse",
            recipient: pool?.ok ? pool.config.signers[2] : "",
            amount: "8923077",
            approvals: pool?.ok ? pool.config.signers.slice(0, 2) : [],
            readyLedger: 20,
            executed: true,
            epoch: "1",
          },
          {
            id: "1",
            proposer: "",
            kind: "Unpause",
            recipient: null,
            amount: null,
            approvals: pool?.ok ? pool.config.signers.slice(0, 2) : [],
            readyLedger: 0,
            executed: true,
            epoch: "1",
          },
        ],
      });
      setFeed({ ok: true, events: [] });
      return;
    }
    try {
      const results = await Promise.allSettled([
        disasterProposals(before),
        disasterEvents(),
      ]);
      setList(
        results[0].status === "fulfilled"
          ? results[0].value
          : {
              ok: false,
              error:
                "Connection lost. Refresh before taking any signer action.",
            },
      );
      setFeed(
        results[1].status === "fulfilled"
          ? results[1].value
          : {
              ok: false,
              error: "Recent transactions are temporarily unavailable.",
            },
      );
    } catch {
      setList({
        ok: false,
        error: "Connection lost. Refresh before taking any signer action.",
      });
    }
  }, [contractId, before, pool]);
  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0);
    if (PREVIEW) return () => clearTimeout(initialLoad);
    const interval = setInterval(() => {
      void refresh();
      void onRefresh();
    }, 10_000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
    };
  }, [refresh, onRefresh]);

  async function confirm() {
    if (!review || busy || PREVIEW) return;
    setBusy(true);
    setError("");
    setReceipt(null);
    try {
      const result = await submission.run(() =>
        review.method === "propose"
          ? disasterPropose(review.input)
          : review.method === "approve"
            ? disasterApprove(review.id)
            : disasterExecute(review.id));
      if (!result) { setReview(null); return; }
      if (!result.ok) { setError(result.error); if (result.pending) setReview(null); }
      else {
        setReceipt(result.link);
        setReview(null);
      }
      await Promise.all([refresh(), onRefresh()]);
    } catch {
      setError(
        "Connection interrupted. Refresh and check the proposal before retrying; the transaction may have been submitted.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!pool || !pool.ok)
    return (
      <section
        aria-label="Disaster Vault controls"
        className={styles.detailCard}
        style={{ marginTop: 20 }}
      >
        <SubmissionStatusPanel guard={submission} onRefresh={onRefresh} />
        <h3>Checking the public pool</h3>
        <p role="status">
          {pool ? pool.error : "Reading the configured Testnet contract…"}
        </p>
        <p>
          Signer actions are available after the D3 contract configuration has
          been verified.
        </p>
        {pool && (
          <Btn kind="quiet" size="sm" onClick={() => void onRefresh()}>
            Try again
          </Btn>
        )}
      </section>
    );
  const viewer = list?.ok ? list.viewer : null;
  const member =
    !PREVIEW && viewer !== null && pool.config.signers.includes(viewer);
  const state = pool.status;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "requests", label: "Payout requests" },
    { id: "proof", label: "Public proof" },
  ];

  return (
    <section aria-label="Disaster Vault controls">
      <SubmissionStatusPanel guard={submission} onRefresh={async () => { await Promise.all([refresh(), onRefresh()]); }} />
      <div
        role="tablist"
        aria-label="Disaster Vault details"
        className={styles.tabs}
        onKeyDown={(event) => {
          const i = tabs.findIndex((item) => item.id === tab);
          const next =
            event.key === "ArrowRight"
              ? (i + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (i + tabs.length - 1) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : null;
          if (next !== null) {
            event.preventDefault();
            setTab(tabs[next].id);
            document.getElementById(`disaster-tab-${tabs[next].id}`)?.focus();
          }
        }}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`disaster-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`disaster-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            className={styles.tab}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {PREVIEW && (
        <div className={styles.previewNotice}>
          Example data for the local design preview. No transactions are sent.
        </div>
      )}

      {tab === "overview" && (
        <div
          role="tabpanel"
          id="disaster-panel-overview"
          aria-labelledby="disaster-tab-overview"
          className={styles.panel}
        >
          <section className={styles.rulesSection}>
            <h2>Shared control. Clear rules.</h2>
            <p>
              Each payout follows the same review process on Stellar Testnet.
            </p>
            <div className={styles.ruleGrid}>
              <div className={styles.ruleTile}>
                <strong>2 of 3</strong>
                <span>Different signer wallets approve each payout.</span>
              </div>
              <div className={styles.ruleTile}>
                <strong>{pool.config.timelock_ledgers} ledgers</strong>
                <span>Review time starts after the second approval.</span>
              </div>
              <div className={styles.ruleTile}>
                <strong>20% cap</strong>
                <span>
                  Rolling 24h spending is limited by the balance at execution.
                </span>
              </div>
              <div className={styles.ruleTile}>
                <strong>Quorum pause</strong>
                <span>Two approvals to pause or resume payouts.</span>
              </div>
            </div>
          </section>
          <div className={styles.detailCard}>
            <h3>Available for payouts</h3>
            <p>
              The allowance is recalculated at execution. Approving a request
              does not reserve it.
            </p>
            <dl className={styles.statList}>
              <dt>Vault balance</dt>
              <dd>{formatStroops(state.balance)} XLM</dd>
              <dt>Paid out in the last 24h</dt>
              <dd>{formatStroops(state.spent_24h)} XLM</dd>
              <dt>20% of the current balance</dt>
              <dd>{formatStroops(state.cap)} XLM</dd>
              <dt>Remaining allowance now</dt>
              <dd>{formatStroops(state.allowance)} XLM</dd>
            </dl>
            <p>
              Contributions remain open while payouts are paused. The wait is
              measured in ledgers, not fixed seconds.
            </p>
          </div>
          <div className={styles.readOnlyNotice}>
            {member
              ? "Your wallet is a configured signer. Open Payout requests to propose, approve, or execute."
              : "Public view. Everyone can review the pool; signer actions are limited to the three configured wallets."}
            {!viewer && !PREVIEW && (
              <Link href="/signin?next=%2Ftransparency">
                Sign in for signer access
              </Link>
            )}
          </div>
          <details className={styles.technicalDetails}>
            <summary>The three signer wallets and custody details</summary>
            <ol>
              {pool.config.signers.map((signer, i) => (
                <li key={signer}>
                  Signer {i + 1}
                  {signer === viewer ? " · your wallet" : ""}
                  <a
                    href={`https://stellar.expert/explorer/testnet/account/${signer}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "block" }}
                  >
                    {signer}
                  </a>
                </li>
              ))}
            </ol>
            <p className={styles.amountNote}>
              Current wallets are custodial Testnet wallets. Three wallet
              approvals do not mean independent key custody or an external
              audit.
            </p>
          </details>
        </div>
      )}

      {tab === "requests" && (
        <div
          role="tabpanel"
          id="disaster-panel-requests"
          aria-labelledby="disaster-tab-requests"
          className={styles.panel}
        >
          {member && (
            <section className={styles.detailCard}>
              <h3>Create a payout request</h3>
              <p>Proposing a payout does not approve it or transfer funds.</p>
              <form
                className={styles.form}
                onSubmit={(event) => {
                  event.preventDefault();
                  setError("");
                  const input = {
                    kind: "Disburse",
                    recipient,
                    money: { amount, currency },
                  };
                  try {
                    const action = parseDisasterAction(input);
                    if (action[0] === "Disburse")
                      setReview({
                        method: "propose",
                        input,
                        summary: `Send ${formatStroops(action[2])} Testnet XLM to ${action[1]}. Creating the proposal does not approve or transfer funds.`,
                      });
                  } catch (err) {
                    setError(
                      err instanceof Error ? err.message : "Invalid proposal",
                    );
                  }
                }}
              >
                <label className={styles.inputLabel}>
                  Recipient wallet (G…)
                  <input
                    aria-label="Recipient wallet"
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    autoCapitalize="off"
                    autoComplete="off"
                    spellCheck={false}
                    required
                    disabled={busy}
                    className={styles.input}
                  />
                </label>
                <label className={styles.inputLabel}>
                  Amount ({CURRENCY[currency].code}, indicative Testnet rate)
                  <input
                    aria-label="Payout amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                    disabled={busy}
                    className={styles.input}
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className={styles.formSubmit}
                >
                  Review payout request
                </button>
              </form>
              <div style={{ marginTop: 12 }}>
                <Btn
                  kind="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    setReview({
                      method: "propose",
                      input: { kind: state.paused ? "Unpause" : "Pause" },
                      summary: `${state.paused ? "Unpause" : "Pause"} payouts. This needs two distinct approvals; control actions have no payout timelock.`,
                    })
                  }
                >
                  Propose {state.paused ? "unpause" : "pause"}
                </Btn>
              </div>
            </section>
          )}
          {!member && (
            <div className={styles.readOnlyNotice}>
              You can inspect every request and its approvals here. Only
              configured signers can take action.
            </div>
          )}
          {review && (
            <div className={styles.reviewCard}>
              <h3>Confirm {review.method}</h3>
              <p>{review.summary}</p>
              <div className={styles.actionPair}>
                <Btn
                  size="sm"
                  disabled={busy || !member}
                  loading={busy}
                  onClick={confirm}
                >
                  Confirm {review.method}
                </Btn>
                <Btn
                  kind="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setReview(null)}
                >
                  Cancel
                </Btn>
              </div>
            </div>
          )}
          {error && (
            <div role="alert" className={styles.errorText}>
              {error}
            </div>
          )}
          {receipt && (
            <p role="status" className={styles.readOnlyNotice}>
              Transaction confirmed.{" "}
              <a href={receipt} target="_blank" rel="noopener noreferrer">
                View the receipt on Stellar Expert
              </a>
            </p>
          )}
          <section className={styles.detailCard}>
            <div className={styles.sectionHeading}>
              <h3>On-chain requests</h3>
              <button
                type="button"
                className={styles.textButton}
                disabled={busy}
                onClick={() => void Promise.all([refresh(), onRefresh()])}
              >
                Refresh {Ico.refresh({ size: 13, c: T.action })}
              </button>
            </div>
            {!list ? (
              <p role="status">Loading requests…</p>
            ) : !list.ok ? (
              <div role="alert" className={styles.errorText}>
                {list.error}
              </div>
            ) : list.proposals.length === 0 ? (
              <p>
                No requests yet. Approved payouts will appear here with their
                review status.
              </p>
            ) : (
              list.proposals.map((proposal) => {
                const remaining =
                  proposal.readyLedger === null
                    ? null
                    : Math.max(0, proposal.readyLedger - state.ledger);
                const stale =
                  proposal.kind !== "Disburse" &&
                  proposal.epoch !== state.epoch;
                const canExecute =
                  !proposal.executed &&
                  !stale &&
                  proposal.approvals.length >= 2 &&
                  remaining === 0 &&
                  (proposal.kind !== "Disburse" ||
                    (!state.paused &&
                      BigInt(proposal.amount!) <= BigInt(state.allowance)));
                const status = proposal.executed
                  ? "Executed"
                  : stale
                    ? "Stale control request"
                    : remaining === null
                      ? "Awaiting two approvals"
                      : remaining > 0
                        ? `Wait ${remaining} ledgers`
                        : proposal.kind === "Disburse" && state.paused
                          ? "Blocked: payouts paused"
                          : proposal.kind === "Disburse" &&
                              BigInt(proposal.amount!) > BigInt(state.allowance)
                            ? "Blocked: exceeds allowance"
                            : "Ready to execute";
                const summary = `Proposal #${proposal.id}: ${proposal.kind}${proposal.amount ? ` ${formatStroops(proposal.amount)} Testnet XLM to ${proposal.recipient}` : ""}.`;
                return (
                  <article key={proposal.id} className={styles.proposal}>
                    <div className={styles.proposalHeader}>
                      <h4>
                        #{proposal.id} ·{" "}
                        {proposal.kind === "Disburse"
                          ? "Payout"
                          : proposal.kind}
                      </h4>
                      <span className={styles.proposalStatus}>{status}</span>
                    </div>
                    {proposal.amount && (
                      <p>
                        {formatStroops(proposal.amount)} Testnet XLM to{" "}
                        <a
                          href={`https://stellar.expert/explorer/testnet/account/${proposal.recipient}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: T.action, overflowWrap: "anywhere" }}
                        >
                          {proposal.recipient?.slice(0, 8)}…
                          {proposal.recipient?.slice(-5)}
                        </a>
                      </p>
                    )}
                    <div
                      className={styles.approvalTrack}
                      aria-label={`${proposal.approvals.length} of 3 wallet approvals`}
                    >
                      {pool.config.signers.map((signer, i) => (
                        <span
                          key={signer}
                          className={styles.approvalChip}
                          data-approved={proposal.approvals.includes(signer)}
                        >
                          {proposal.approvals.includes(signer) ? "✓" : "○"}{" "}
                          Signer {i + 1}
                        </span>
                      ))}
                    </div>
                    <p>
                      {proposal.approvals.length}/3 approvals · {status}
                    </p>
                    {member && !proposal.executed && !stale && (
                      <div className={styles.actionPair}>
                        <Btn
                          size="sm"
                          kind="secondary"
                          disabled={
                            busy || proposal.approvals.includes(viewer!)
                          }
                          onClick={() =>
                            setReview({
                              method: "approve",
                              id: proposal.id,
                              summary,
                            })
                          }
                        >
                          Approve #{proposal.id}
                        </Btn>
                        <Btn
                          size="sm"
                          disabled={busy || !canExecute}
                          onClick={() =>
                            setReview({
                              method: "execute",
                              id: proposal.id,
                              summary,
                            })
                          }
                        >
                          Execute #{proposal.id}
                        </Btn>
                      </div>
                    )}
                  </article>
                );
              })
            )}
            <div className={styles.actionPair}>
              {before !== "0" && (
                <Btn
                  kind="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setBefore("0")}
                >
                  Newest requests
                </Btn>
              )}
              {list?.ok &&
                list.proposals.length > 0 &&
                BigInt(list.proposals.at(-1)!.id) > 1n && (
                  <Btn
                    kind="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => setBefore(list.proposals.at(-1)!.id)}
                  >
                    Earlier requests
                  </Btn>
                )}
            </div>
          </section>
        </div>
      )}

      {tab === "proof" && (
        <div
          role="tabpanel"
          id="disaster-panel-proof"
          aria-labelledby="disaster-tab-proof"
          className={styles.panel}
        >
          <section className={styles.rulesSection}>
            <h2>Follow the public trail.</h2>
            <p>
              Inspect the configured contract and archived Testnet payout on
              Stellar Expert.
            </p>
          </section>
          <a
            className={styles.receiptLink}
            href={`https://stellar.expert/explorer/testnet/contract/${pool.contractId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div>
              <strong>Active D3 contract</strong>
              <span>
                {pool.contractId.slice(0, 12)}…{pool.contractId.slice(-7)}
              </span>
            </div>
            {Ico.link({ size: 17, c: T.action })}
          </a>
          <a
            className={styles.receiptLink}
            href={ARCHIVED_PAYOUT}
            target="_blank"
            rel="noopener noreferrer"
          >
            <div>
              <strong>Archived authenticated payout</strong>
              <span>15 Sep 2026 · 0.8923077 Testnet XLM</span>
            </div>
            {Ico.link({ size: 17, c: T.action })}
          </a>
          <section className={styles.detailCard}>
            <h3>Recent D3 transactions</h3>
            <p>
              A bounded feed of up to 100 events from the last 720 ledgers.
              Older evidence remains in the D3 report.
            </p>
            {!feed ? (
              <p role="status">Loading events…</p>
            ) : !feed.ok ? (
              <div role="alert" className={styles.errorText}>
                {feed.error}
              </div>
            ) : feed.events.length === 0 ? (
              <p>
                No events in this window. This does not mean the pool has no
                historical transactions.
              </p>
            ) : (
              feed.events.map((event) => (
                <a
                  key={event.id}
                  className={styles.eventLink}
                  href={event.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>
                    {event.action} · ledger {event.ledger}
                  </span>
                  <span>{event.hash.slice(0, 9)}… ↗</span>
                </a>
              ))
            )}
          </section>
          <details className={styles.technicalDetails}>
            <summary>Technical documentation and implementation</summary>
            <ul>
              <li>
                <a href={REPORT} target="_blank" rel="noopener noreferrer">
                  D3 report, controls and acceptance evidence
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Ariqhermawan/salapi/pull/10"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Implementation review · PR #10
                </a>
              </li>
              <li>
                <Link href="/docs">All Salapi Testnet contracts</Link>
              </li>
            </ul>
            <p className={styles.amountNote}>
              D3 rules apply to this shared Disaster Vault. Donation campaigns
              use separate D4 escrow and proof rules.
            </p>
          </details>
          {publicProof}
        </div>
      )}
    </section>
  );
}
