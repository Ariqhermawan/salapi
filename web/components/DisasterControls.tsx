"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Info } from "@phosphor-icons/react/dist/csr/Info";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  disasterApprove,
  disasterEvents,
  disasterExecute,
  disasterProposals,
  disasterPropose,
  type disasterState,
} from "@/app/disaster-actions";
import { formatStroops } from "@/lib/format-stroops";
import { parseDisasterAction } from "@/lib/disaster";
import { useT } from "@/components/I18nProvider";
import { CURRENCY } from "@/lib/ui/currency";
import { useMarketPrices } from "@/components/MarketPricesProvider";
import { formatMarketValue } from "@/lib/market-prices";
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
type Tab = "vault" | "activity";
type ActivityFilter = "all" | "in" | "out";
const PREVIEW = process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1";
const REPORT =
  "https://github.com/Ariqhermawan/salapi/blob/98a4a701b3fbd6d71a55c346c06d76c0001bc37e/docs/instawards/week-3-d3.md";
const ARCHIVED_PAYOUT =
  "https://stellar.expert/explorer/testnet/tx/4559f41883fdc0a0e4fefa7e5bb16c19c26683768cbffaaf10edf9019d7eb0ac";
const PREVIEW_EVENT_COPY: Record<string, { title: string; detail: string; amount: string }> = {
  "sample-contribution-1": { title: "Contribution", detail: "From a sample donor", amount: "+0.05 XLM" },
  "sample-contribution-2": { title: "Contribution", detail: "From a sample donor", amount: "+0.25 XLM" },
  "sample-contribution-3": { title: "Contribution", detail: "From a sample donor", amount: "+0.12 XLM" },
  "sample-payout-1": { title: "Typhoon relief, Cebu", detail: "NGO · To Tulong Cebu Relief", amount: "−0.50 XLM" },
};
const VAULT_NOTES = [45, 50, 42, 52, 47, 40, 49, 44, 53, 46, 41, 51, 43, 48, 52, 45];

function shortAddress(address: string | null) {
  return address ? `${address.slice(0, 8)}…${address.slice(-5)}` : null;
}

export default function DisasterControls({
  pool,
  onRefresh,
  publicProof,
  hideTabs = false,
  onContribute,
}: {
  pool: Pool | null;
  onRefresh: () => Promise<void>;
  publicProof?: ReactNode;
  hideTabs?: boolean;
  onContribute?: () => void;
}) {
  const submission = useUnresolvedSubmission("disaster:d3");
  const { currency } = useT();
  const { prices } = useMarketPrices();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "activity" ? "activity" : "vault";
  const requestedFilter = searchParams.get("filter");
  const activityFilter: ActivityFilter = requestedFilter === "in" || requestedFilter === "contributions"
    ? "in"
    : requestedFilter === "out" || requestedFilter === "payouts"
      ? "out"
      : "all";
  const [list, setList] = useState<Proposals | null>(null);
  const [feed, setFeed] = useState<EventFeed | null>(null);
  const [before, setBefore] = useState("0");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [submittingBusy, setBusy] = useState(false);
  const [loadedVaultPoster, setLoadedVaultPoster] = useState("");
  const busy = submittingBusy || submission.locked;
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const contractId = pool?.ok ? pool.contractId : null;
  function setView(nextTab: Tab, nextFilter: ActivityFilter = "all") {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    params.delete("filter");
    if (nextTab === "activity") {
      params.set("tab", "activity");
      if (nextFilter !== "all") params.set("filter", nextFilter);
    }
    const query = params.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }
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
      setFeed({ ok: true, events: [
        { id: "sample-contribution-1", ledger: 19, hash: "", link: "", action: "Contribution", kind: "contribution", counterparty: null, amount: "500000", time: "" },
        { id: "sample-contribution-2", ledger: 20, hash: "", link: "", action: "Contribution", kind: "contribution", counterparty: null, amount: "2500000", time: "" },
        { id: "sample-contribution-3", ledger: 21, hash: "", link: "", action: "Contribution", kind: "contribution", counterparty: null, amount: "1200000", time: "" },
        { id: "sample-payout-1", ledger: 21, hash: "", link: "", action: "Payout", kind: "payout", counterparty: null, amount: "5000000", time: "" },
      ] });
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

  if ((!pool || !pool.ok) && tab === "activity") {
    const unavailableReason = pool ? pool.error : "Reading the configured Testnet contract…";
    return (
      <section aria-label="Disaster Vault controls">
        <SubmissionStatusPanel guard={submission} onRefresh={onRefresh} />
        <div role="tabpanel" id="disaster-panel-activity" aria-labelledby="disaster-tab-activity" className={styles.panel}>
          <section className={styles.vaultBank} aria-label="Shared pool balance">
            <div className={styles.vaultScene} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.vaultArt} src="/illustrations/disaster-vault-empty.webp" alt="" width={720} height={480} />
              <div className={styles.vaultGlassShimmer} />
              <div className={styles.vaultTwinkles}><i /><i /><i /></div>
            </div>
            <div className={styles.vaultSummary}>
              <div className={styles.activitySummaryHeading}>
                <span className={styles.eyebrow}>Shared pool balance</span>
                <details className={styles.inlinePayoutInfo}>
                  <summary aria-label="Why the pool balance is unavailable"><Info size={16} aria-hidden="true" /></summary>
                  <p>The D3 Testnet pool has not been verified in this environment yet. Its balance and activity will appear here when the contract configuration is available.</p>
                </details>
              </div>
              <p className={styles.vaultMarketValue}>—</p>
              <p className={styles.vaultNativeValue}>Testnet balance unavailable</p>
              <p className={styles.activityContributionMeta}>Waiting for verified pool activity</p>
              <button type="button" className={styles.activityContribute} disabled={!onContribute} onClick={onContribute}>Contribute</button>
            </div>
          </section>
          <div className={styles.vaultActivityHeading}><h2 id="vault-activity-heading">Activity</h2></div>
          <div className={styles.vaultActivityFilters} role="tablist" aria-label="Filter activity">
            {([ ["all", "All"], ["in", "Contributions"], ["out", "NGO payouts"] ] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={activityFilter === value} onClick={() => setView("activity", value)}>{label}</button>
            ))}
          </div>
          {(activityFilter === "all" || activityFilter === "out") && (
            <section className={styles.vaultPayouts} aria-label="NGO payouts">
              <header><span className={styles.vaultPayoutsMark} aria-hidden="true">↗</span><span className={styles.vaultPayoutsTitle}><strong>NGO payouts</strong><small>Money the vault sent to relief groups on the ground</small></span></header>
              <p className={styles.activityEmpty}>Payout history is unavailable until the Testnet pool is verified.</p>
            </section>
          )}
          {(activityFilter === "all" || activityFilter === "in") && (
            <>
              <div className={styles.vaultContributionHeading}><h3>Contributions</h3><span>1% of every donation</span></div>
              <section className={styles.vaultContributions} aria-label="Contributions">
                <p className={styles.activityEmpty}>Contribution history is unavailable until the Testnet pool is verified.</p>
              </section>
            </>
          )}
          <details className={styles.technicalDetails}>
            <summary>On-chain records and technical documentation</summary>
            <p role="status" className={styles.activityFeedback}>{unavailableReason}</p>
            <Link className={styles.receiptLink} href="/docs">Read the public technical documentation {Ico.link({ size: 17, c: T.action })}</Link>
          </details>
        </div>
      </section>
    );
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
  const funded = state.balance !== "0";
  const vaultPoster = funded ? "/illustrations/disaster-vault-funded.webp" : "/illustrations/disaster-vault-empty.webp";
  const marketEstimate = formatMarketValue(state.balance, prices, currency);
  const contributionEvents = feed?.ok ? feed.events.filter(event => event.kind === "contribution") : [];
  const payoutEvents = feed?.ok ? feed.events.filter(event => event.kind === "payout") : [];
  const tabs: { id: Tab; label: string }[] = [
    { id: "vault", label: "Vault" },
    { id: "activity", label: "Activity" },
  ];

  return (
    <section aria-label="Disaster Vault controls">
      <SubmissionStatusPanel guard={submission} onRefresh={async () => { await Promise.all([refresh(), onRefresh()]); }} />
      {!hideTabs && <div
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
            setView(tabs[next].id);
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
            onClick={() => setView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>}
      {tab === "vault" && (
        <div
          role="tabpanel"
          id="disaster-panel-vault"
          aria-labelledby="disaster-tab-vault"
          className={styles.panel}
        >
          <section className={styles.rulesSection}>
            <h2>How this vault works</h2>
            <ol className={styles.vaultSteps}>
              <li>
                <strong>Pool contributions</strong>
                <p>Contributions gather in one shared Testnet fund, separate from personal wallets.</p>
              </li>
              <li>
                <strong>Review a payout</strong>
                <p>A configured signer requests a payment. Two of the three different signer wallets must approve it.</p>
              </li>
              <li>
                <strong>Wait, then pay</strong>
                <p>After the second approval, wait {pool.config.timelock_ledgers} ledgers. Execution must fit the {pool.config.cap_bps / 100}% rolling 24h spending cap.</p>
              </li>
            </ol>
            <p className={styles.pauseNote}>
              Two approvals can pause or resume payouts. Contributions stay open.
            </p>
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
              <dt>{pool.config.cap_bps / 100}% of the current balance</dt>
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
              ? "Your wallet is a configured signer. Create and review payout requests below."
              : "Public view. Everyone can review the pool; signer actions are limited to the three configured wallets."}
            {!viewer && !PREVIEW && (
              <Link href="/signin?next=%2Fvault">
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

      {tab === "vault" && (
        <section aria-label="Payout requests" className={styles.panel}>
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
                      <div>
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
                        <Link href={`/ngo/${encodeURIComponent(proposal.recipient ?? "")}`} className={styles.textButton}>View recipient profile</Link>
                      </div>
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
        </section>
      )}

      {tab === "activity" && (
        <div
          role="tabpanel"
          id="disaster-panel-activity"
          aria-labelledby="disaster-tab-activity"
          className={styles.panel}
        >
          <section className={styles.vaultBank} aria-label="Shared pool balance">
            <div className={styles.vaultScene} aria-hidden="true">
              <svg width="0" height="0" className={styles.vaultOptics} aria-hidden="true">
                <filter id="disaster-vault-rim" colorInterpolationFilters="sRGB">
                  <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 3 0 0" result="cool" />
                  <feFlood style={{ floodColor: "var(--sl-primary, #3155dc)" }} />
                  <feComposite in2="cool" operator="in" />
                  <feComposite in2="SourceGraphic" operator="atop" />
                </filter>
              </svg>
              {funded && loadedVaultPoster === vaultPoster && (
                <div className={styles.vaultNotes}>
                  {VAULT_NOTES.map((left, index) => (
                    <span
                      key={index}
                      className={styles.vaultBanknote}
                      style={{
                        left: `${left}%`,
                        "--delay": `${-index * 210}ms`,
                        "--drift": `${(left - 46) * 13}%`,
                        "--tilt": `${(index % 5 - 2) * 8}deg`,
                      } as CSSProperties}
                    />
                  ))}
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.vaultArt}
                src={vaultPoster}
                alt=""
                width={720}
                height={480}
                onLoad={() => setLoadedVaultPoster(vaultPoster)}
              />
              {!funded && (
                <>
                  <div className={styles.vaultGlassShimmer} />
                  <div className={styles.vaultTwinkles}><i /><i /><i /></div>
                </>
              )}
              {funded && (
                <>
                  <div className={styles.vaultCashHighlights} style={{ backgroundImage: `url("${vaultPoster}")` }} />
                  <div className={styles.vaultTwinkles}><i /><i /><i /></div>
                </>
              )}
            </div>
            <div className={styles.vaultSummary}>
              <div className={styles.activitySummaryHeading}>
                <span className={styles.eyebrow}>Shared pool balance</span>
                <details className={styles.inlinePayoutInfo}>
                  <summary aria-label="How the vault pays out"><Info size={16} aria-hidden="true" /></summary>
                  <p>{state.paused ? "Payouts are paused. " : "Payouts are active. "}Two of three configured signers approve. Payouts wait 20 ledgers and stay within a {pool.config.cap_bps / 100}% rolling 24-hour cap. Any displayed fiat value is a market estimate; Testnet XLM has no cash value.</p>
                </details>
              </div>
              <p className={styles.vaultMarketValue} aria-live="polite">
                {marketEstimate ? `≈ ${marketEstimate}` : "Market estimate unavailable"}
              </p>
              <p className={styles.vaultNativeValue}>≈ {formatStroops(state.balance)} XLM</p>
              <p className={styles.activityContributionMeta}>
                {feed?.ok ? `From ${contributionEvents.length}${PREVIEW ? "" : " recent"} contributions` : "Contribution history unavailable"}
              </p>
              <button type="button" className={styles.activityContribute} disabled={!onContribute} onClick={onContribute}>Contribute</button>
            </div>
          </section>
          <div className={styles.vaultActivityHeading}><h2 id="vault-activity-heading">Activity</h2></div>
          <div className={styles.vaultActivityFilters} role="tablist" aria-label="Filter activity">
            {([ ["all", "All"], ["in", "Contributions"], ["out", "NGO payouts"] ] as const).map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={activityFilter === value} onClick={() => setView("activity", value)}>
                {label}
              </button>
            ))}
          </div>
          {!feed ? <p role="status" className={styles.activityFeedback}>Loading activity…</p> : !feed.ok ? (
            <p role="alert" className={styles.activityFeedback}>{feed.error}</p>
          ) : (
            <>
              {(activityFilter === "all" || activityFilter === "out") && (
                <section className={styles.vaultPayouts} aria-label="NGO payouts">
                  <header>
                    <span className={styles.vaultPayoutsMark} aria-hidden="true">↗</span>
                    <span className={styles.vaultPayoutsTitle}>
                      <strong>NGO payouts</strong>
                      <small>Money the vault sent to relief groups on the ground</small>
                    </span>
                    {payoutEvents.length > 0 && <b>{payoutEvents.length}</b>}
                  </header>
                  {payoutEvents.length === 0 ? <p className={styles.activityEmpty}>No payouts yet</p> : payoutEvents.map(event => {
                    const sampleCopy = PREVIEW ? PREVIEW_EVENT_COPY[event.id] : undefined;
                    const recipient = shortAddress(event.counterparty);
                    const detail = sampleCopy?.detail ?? (recipient ? `To ${recipient}` : `Ledger ${event.ledger}`);
                    const amount = sampleCopy?.amount ?? (event.amount === null ? `${event.hash.slice(0, 9)}…` : `−${formatStroops(event.amount)} XLM`);
                    const content = <><span><strong>{sampleCopy?.title ?? "Payout"}</strong><small>{detail}</small></span><b>{amount}</b></>;
                    return event.link
                      ? <a key={event.id} className={styles.vaultActivityRow} href={event.link} target="_blank" rel="noopener noreferrer" aria-label={`Payout. ${detail}. ${amount}.`}>{content}</a>
                      : <div key={event.id} className={styles.vaultActivityRow} aria-label={`Payout. ${detail}. ${amount}.`}>{content}</div>;
                  })}
                </section>
              )}
              {(activityFilter === "all" || activityFilter === "in") && (
                <>
                  <div className={styles.vaultContributionHeading}>
                    <h3>Contributions</h3><span>1% of every donation</span>
                  </div>
                  <section className={styles.vaultContributions} aria-label="Contributions">
                    {contributionEvents.length === 0 ? <p className={styles.activityEmpty}>No contributions yet</p> : contributionEvents.map(event => {
                      const sampleCopy = PREVIEW ? PREVIEW_EVENT_COPY[event.id] : undefined;
                      const donor = shortAddress(event.counterparty) ?? `Ledger ${event.ledger}`;
                      const detail = sampleCopy?.detail ?? "Contributed to the Disaster Vault";
                      const amount = sampleCopy?.amount ?? (event.amount === null ? `${event.hash.slice(0, 9)}…` : `+${formatStroops(event.amount)} XLM`);
                      const content = <><span><strong>{sampleCopy?.title ?? donor}</strong><small>{detail}</small></span><b>{amount}</b></>;
                      return event.link
                        ? <a key={event.id} className={styles.vaultActivityRow} href={event.link} target="_blank" rel="noopener noreferrer" aria-label={`Contribution from ${donor}. ${detail}. ${amount}.`}>{content}</a>
                        : <div key={event.id} className={styles.vaultActivityRow} aria-label={`Contribution from ${donor}. ${detail}. ${amount}.`}>{content}</div>;
                    })}
                  </section>
                </>
              )}
            </>
          )}
          <details className={styles.technicalDetails}>
            <summary>On-chain records and technical documentation</summary>
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
          </details>
        </div>
      )}
    </section>
  );
}
