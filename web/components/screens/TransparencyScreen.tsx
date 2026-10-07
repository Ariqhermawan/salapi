"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useGoBack } from "@/lib/ui/useGoBack";
import { disasterState, disasterContribute } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Ico, Btn, PoweredByStellar } from "@/components/ui/kit";
import { CURRENCY, formatLocalAmount } from "@/lib/ui/currency";
import { formatStroops } from "@/lib/format-stroops";
import DisasterControls from "@/components/DisasterControls";
import { CampaignEvidence } from "@/components/screens/CampaignScreen";
import type { Locale } from "@/lib/i18n/config";
import styles from "./VaultsRevamp.module.css";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";

const EXPLORER = "https://stellar.expert/explorer/testnet";
const PREVIEW = process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1";
const LEGACY_DISASTER_CONTRACT =
  "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ";
const CONTRACTS = [
  {
    name: "base-vault",
    id: "CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD",
  },
  {
    name: "username-registry",
    id: "CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3",
  },
  { name: "Historical disaster (single admin)", id: LEGACY_DISASTER_CONTRACT },
  {
    name: "paluwagan",
    id: "CCXNSK6IGPSB4QGUSNB2EFZWYV53NKVX5AV3XSJANCDDD7TULGQSY37X",
  },
  {
    name: "smart-savings",
    id: "CBQBUAOP3T235Q2U63XNC2NQVNAOXQL2KHWALO6FTIOJS46NTKIZJ5WI",
  },
  {
    name: "arisan-rooms",
    id: "CDAUA3TN4PRJFVHWBITT2DZMCY24DEZRA4NQLZLEX5CKL6AOA6RLII4S",
  },
];
const TRAIL = [
  {
    step: "Deploy disaster vault",
    hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12",
  },
  {
    step: "Register @juandelacruz",
    hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913",
  },
  {
    step: "Initialize(admin, token)",
    hash: "f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1",
  },
  {
    step: "Contribute 5 XLM",
    hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66",
  },
  {
    step: "set_disaster(true)",
    hash: "7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a",
  },
  {
    step: "Disburse 2 XLM",
    hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837",
  },
];
const QUICK: Record<Locale, string[]> = {
  en: ["1", "2", "5", "10", "20"],
  tl: ["50", "100", "200", "500", "1000"],
  id: ["10000", "20000", "50000", "100000", "200000"],
  vi: ["20000", "50000", "100000", "200000", "500000"],
};
type Pool = Awaited<ReturnType<typeof disasterState>>;
const previewPool: Pool = {
  ok: true,
  contractId: "CCN2O4Z6CSUVF74DWZBJJ526IMEXVRCYKY74PM5BDKA22WWTOW5WHZDY",
  config: {
    signers: [
      "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y",
      "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H",
      "GAXPCCZD3AKYIRCI5CCX2TRIMVGQ45XEUEZPF5RBUZHYFRRZGN64ZNO3",
    ],
    token: "",
    cap_bps: 2000,
    timelock_ledgers: 20,
  },
  pesos: 45,
  pesoLabel: "₱45",
  active: true,
  status: {
    balance: "80307692",
    spent_24h: "0",
    cap: "16061538",
    allowance: "16061538",
    paused: false,
    epoch: "1",
    ledger: 21,
    next_id: "3",
  },
};

export default function TransparencyScreen() {
  const submission = useUnresolvedSubmission("disaster:d3");
  const { currency } = useT();
  const goBack = useGoBack("/vaults");
  const [pool, setPool] = useState<Pool | null>(PREVIEW ? previewPool : null);
  const [phase, setPhase] = useState<"view" | "amount" | "processing" | "done">(
    "view",
  );
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<{ link?: string } | null>(null);
  const [err, setErr] = useState("");
  const [transitionPending, start] = useTransition();
  const pending = transitionPending || submission.locked;
  const touched = useRef(false);
  const refresh = useCallback(async () => {
    if (PREVIEW) return;
    try {
      setPool(await disasterState());
    } catch {
      setPool({
        ok: false,
        error: "The pool couldn't be loaded. Please try again.",
      });
    }
  }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(initialLoad);
  }, [refresh]);
  useEffect(() => {
    const initialAmount = setTimeout(() => {
      if (!touched.current) setAmount(QUICK[currency][2]);
    }, 0);
    return () => clearTimeout(initialAmount);
  }, [currency]);
  const amt = Number(amount) || 0;
  const label = formatLocalAmount(amt, currency);
  function donate() {
    if (PREVIEW) {
      setErr(
        "This local design preview does not send transactions. Your balance stays unchanged.",
      );
      return;
    }
    if (pending || !pool?.ok || amt <= 0) return;
    setPhase("processing");
    start(async () => {
      setErr("");
      try {
        const result = await submission.run(() => disasterContribute({ amount, currency }));
        if (!result) { setPhase("amount"); return; }
        if (result.ok) {
          setDone({ link: result.link });
          setPhase("done");
        } else {
          setErr(result.error);
          setPhase("amount");
        }
      } catch {
        setErr(
          "The connection was interrupted. Check the public pool and your activity before retrying; the contribution may have been submitted.",
        );
        setPhase("amount");
      }
      await refresh();
    });
  }

  if (phase === "processing")
    return (
      <div className={styles.screen}>
        <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
        <div className={styles.publicBack}>
          <span className={styles.publicBadge}>Stellar Testnet</span>
        </div>
        <section
          className={styles.detailCard}
          style={{ textAlign: "center", padding: "38px 20px" }}
        >
          <span
            className="sl-spin"
            aria-hidden="true"
            style={{
              width: 42,
              height: 42,
              border: "3px solid #d9e6ff",
              borderTopColor: T.action,
              borderRadius: "50%",
              display: "inline-block",
              marginBottom: 20,
            }}
          />
          <h2>Submitting your contribution</h2>
          <p role="status">
            Waiting for the Testnet transaction result. Keep this page open.
          </p>
          <p>{label} at an indicative Testnet conversion rate.</p>
        </section>
      </div>
    );
  if (phase === "done" && done)
    return (
      <div className={styles.screen}>
        <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
        <div className={styles.publicBack}>
          <button
            className={styles.backLink}
            type="button"
            onClick={() => {
              setDone(null);
              setPhase("view");
            }}
          >
            {Ico.back({ size: 14, c: T.action })} Back to the pool
          </button>
        </div>
        <section className={styles.rulesSection}>
          <span className={styles.eyebrow}>Transaction confirmed</span>
          <h1>Contribution received.</h1>
          <p>
            {label} at an indicative Testnet conversion rate. These are
            valueless Testnet tokens.
          </p>
        </section>
        <div className={styles.detailCard} style={{ marginTop: 17 }}>
          <h3>Public pool balance</h3>
          <p>
            {pool?.ok
              ? `${formatStroops(pool.status.balance)} Testnet XLM`
              : "Refresh to read the latest pool balance."}
          </p>
          {done.link && (
            <a
              className={styles.receiptLink}
              href={done.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              <div>
                <strong>View your transaction receipt</strong>
                <span>Verify it on Stellar Expert</span>
              </div>
              {Ico.link({ size: 17, c: T.action })}
            </a>
          )}
        </div>
        <div className={styles.actionPair}>
          <Btn
            onClick={() => {
              setDone(null);
              setPhase("view");
            }}
          >
            View the pool
          </Btn>
        </div>
        <footer className={styles.footer}>
          <PoweredByStellar />
        </footer>
      </div>
    );
  if (phase === "amount")
    return (
      <div className={styles.screen}>
        <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
        <div className={styles.publicBack}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => setPhase("view")}
          >
            {Ico.back({ size: 14, c: T.action })} Disaster Vault
          </button>
          <span className={styles.publicBadge}>Stellar Testnet</span>
        </div>
        <section className={styles.publicHeader}>
          <div>
            <span className={styles.eyebrow}>
              Contribute to the public pool
            </span>
            <h1>Give together.</h1>
            <p>
              Help fund this shared Disaster Vault. Payouts follow its approval
              rules.
            </p>
          </div>
        </section>
        {PREVIEW && (
          <div className={styles.previewNotice}>
            Local preview · example data
          </div>
        )}
        <div className={styles.warmSection}>
          <label className={styles.inputLabel} htmlFor="disaster-contribution">
            Contribution amount ({CURRENCY[currency].code})
          </label>
          <input
            id="disaster-contribution"
            className={styles.input}
            value={amount}
            inputMode="decimal"
            autoComplete="off"
            onChange={(event) => {
              touched.current = true;
              setAmount(event.target.value.replace(/[^0-9.]/g, ""));
            }}
            style={{ fontSize: 30, fontWeight: 650, padding: "19px 14px" }}
          />
          <div className={styles.actionPair} style={{ flexWrap: "wrap" }}>
            {QUICK[currency].map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={amount === value}
                className={styles.softLabel}
                style={{
                  border: 0,
                  cursor: "pointer",
                  background: amount === value ? T.action : "white",
                  color: amount === value ? "white" : T.action,
                  padding: "10px 12px",
                }}
                onClick={() => {
                  touched.current = true;
                  setAmount(value);
                }}
              >
                {formatLocalAmount(Number(value), currency)}
              </button>
            ))}
          </div>
          <p className={styles.amountNote}>
            Display currencies use an indicative conversion. The transaction
            sends valueless Stellar Testnet XLM, not real money.
          </p>
        </div>
        <div className={styles.readOnlyNotice} style={{ marginTop: 17 }}>
          Contributions remain open even if payouts are paused. Two different
          configured signer wallets approve a payout, followed by the 20-ledger
          wait and spending cap.
        </div>
        {err && (
          <div
            role="alert"
            className={styles.errorText}
            style={{ marginTop: 15 }}
          >
            {err}
          </div>
        )}
        <div className={styles.actionPair}>
          <Btn
            disabled={pending || amt <= 0 || !pool?.ok}
            loading={pending}
            onClick={donate}
          >
            {PREVIEW
              ? "Preview contribution"
              : `Confirm Testnet contribution · ${label}`}
          </Btn>
        </div>
      </div>
    );

  const appendix = (
    <>
      <details className={styles.evidenceAppendix}>
        <summary>Historical deployment trail, before D3</summary>
        <section className={styles.detailCard}>
          <p>
            This trail belongs to the legacy single-admin deployment. Its funds
            and transactions are separate from the current D3 pool.
          </p>
          {TRAIL.map((tx) => (
            <a
              key={tx.hash}
              href={`${EXPLORER}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.eventLink}
            >
              <span>{tx.step}</span>
              {Ico.link({ size: 13, c: T.action })}
            </a>
          ))}
          <a
            className={styles.eventLink}
            href={`${EXPLORER}/contract/${LEGACY_DISASTER_CONTRACT}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Historical Disaster contract ↗
          </a>
        </section>
      </details>
      <details className={styles.evidenceAppendix}>
        <summary>Other Salapi Testnet contracts</summary>
        <section className={styles.detailCard}>
          {CONTRACTS.map((contract) => (
            <a
              key={contract.id}
              className={styles.eventLink}
              href={`${EXPLORER}/contract/${contract.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>{contract.name}</span>
              {Ico.link({ size: 13, c: T.action })}
            </a>
          ))}
          <Link className={styles.eventLink} href="/docs">
            Read the documentation ↗
          </Link>
        </section>
      </details>
      <details className={styles.evidenceAppendix}>
        <summary>Separate donation campaign evidence, D4</summary>
        <p className={styles.amountNote}>
          Campaigns use their own escrow and proof approvals. They do not use
          the D3 pool rules for the 20-ledger wait or spending cap.
        </p>
        <CampaignEvidence />
      </details>
    </>
  );
  return (
    <div className={styles.screen}>
      <div className={styles.publicBack}>
        <button type="button" className={styles.backLink} onClick={goBack}>
          {Ico.back({ size: 14, c: T.action })} Vaults
        </button>
        <span className={styles.publicBadge}>Public · no login needed</span>
      </div>
      <header className={styles.publicHeader}>
        <div>
          <span className={styles.eyebrow}>Community Disaster Vault</span>
          <h1>Care, with shared control.</h1>
          <p>
            A public pool for disaster relief. Follow each request from approval
            to payout.
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/disaster.png"
          alt="Hands holding a community shelter"
        />
      </header>
      <div className={styles.testnetNote}>
        <span className={styles.statusDot} /> Stellar Testnet{" "}
        <span>No real money</span>
        {PREVIEW && <strong>Example data</strong>}
      </div>
      <section className={styles.poolCard} aria-label="Community pool balance">
        <span className={styles.eyebrow}>Shared pool balance</span>
        {pool === null ? (
          <p role="status" className={styles.amountNote}>
            Reading the Testnet pool…
          </p>
        ) : pool.ok ? (
          <div className={styles.poolAmount}>
            {formatStroops(pool.status.balance)}
            <small>Testnet XLM</small>
          </div>
        ) : (
          <div role="alert">
            <p className={styles.amountNote}>{pool.error}</p>
            <button
              type="button"
              className={styles.textButton}
              onClick={() => void refresh()}
            >
              Try again
            </button>
          </div>
        )}
        <div className={styles.poolMeta}>
          <span
            className={
              pool?.ok && !pool.status.paused
                ? styles.activePill
                : styles.pausedPill
            }
          >
            {pool?.ok
              ? pool.status.paused
                ? "Payouts paused"
                : "Payouts active"
              : "Status unavailable"}
          </span>
          <span>
            {pool?.ok ? "2-of-3 wallet approvals" : "Checking contract"}
          </span>
        </div>
      </section>
      <p className={styles.amountNote}>
        This is the community pool, separate from your personal wallet. Testnet
        XLM has no real value.
      </p>
      <div className={styles.donateRow}>
        <Btn
          disabled={!pool?.ok}
          kind="primary"
          size="md"
          leading={Ico.plus({ size: 16, c: "white" })}
          onClick={() => {
            setErr("");
            setPhase("amount");
          }}
        >
          Contribute to the pool
        </Btn>
      </div>
      <DisasterControls
        pool={pool}
        onRefresh={refresh}
        publicProof={appendix}
      />
      <footer className={styles.footer}>
        <PoweredByStellar />
        <span>Public proof on Stellar Testnet.</span>
      </footer>
    </div>
  );
}
