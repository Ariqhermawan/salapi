"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useGoBack } from "@/lib/ui/useGoBack";
import { disasterState, disasterContribute } from "@/app/actions";
import { useT } from "@/components/I18nProvider";
import { T, Ico, Btn, PoweredByStellar } from "@/components/ui/kit";
import { CURRENCY, formatLocalAmount } from "@/lib/ui/currency";
import { formatStroops } from "@/lib/format-stroops";
import DisasterControls from "@/components/DisasterControls";
import DisasterNgoDirectory from "@/components/screens/DisasterNgoDirectory";
import DisasterPartnersPreview from "@/components/screens/DisasterPartnersPreview";
import { CampaignEvidence } from "@/components/screens/CampaignScreen";
import type { Locale } from "@/lib/i18n/config";
import styles from "./VaultsRevamp.module.css";
import { useUnresolvedSubmission } from "@/lib/ui/useUnresolvedSubmission";
import SubmissionStatusPanel from "@/components/ui/SubmissionStatusPanel";
import AvailableWalletBalance from "@/components/AvailableWalletBalance";
import { localToStroops } from "@/lib/money";

const EXPLORER = "https://stellar.expert/explorer/testnet";
const PREVIEW = process.env.NEXT_PUBLIC_LOCAL_PREVIEW === "1";
const LEGACY_DISASTER_CONTRACT =
  "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ";
const CONTRACTS = [
  {
    name: "base-vault (fixed, Testnet smoke instance)",
    id: "CCHYLXQ7A6GC7M27GOKGTRKMOSGKCURCVGABXYDQMYJXGKHQ2UMGMJKT",
  },
  {
    name: "base-vault (historical, pre-fix)",
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
    name: "donation-campaign (D4)",
    id: "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU",
  },
  {
    name: "recurring-campaign v5 (D5 default Testnet deployment)",
    id: "CDI6V4XTDDDAVW5GLJE6JOZ4AZO3TWCUJ54ZWYOTQFUNX4HXIJVPKK24",
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
const PREVIEW_DISASTER = {
  title: "Bantayan Island - new roofs for a barangay school",
  location: "Cebu, PH",
  raised: 318.5,
  target: 600,
  photos: [
    "/circles/generated/quezon-roof-repair.png",
    "/circles/generated/cebu-family-home.png",
    "/circles/generated/cebu-boat-repairs.png",
    "/circles/generated/tino-relief-materials.png",
  ],
};

export default function TransparencyScreen({ initialPhase = "view" }: { initialPhase?: "view" | "amount" }) {
  const submission = useUnresolvedSubmission("disaster:d3");
  const { currency } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ngoView = searchParams.get("ngo");
  const activityView = searchParams.get("tab") === "activity";
  const goBack = useGoBack(initialPhase === "amount" ? "/vault" : "/");
  const [pool, setPool] = useState<Pool | null>(PREVIEW ? previewPool : null);
  const [phase, setPhase] = useState<"view" | "amount" | "processing" | "done">(initialPhase);
  const [controlsOpen, setControlsOpen] = useState(false);
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

  function selectVaultTab(tab: "vault" | "activity") {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tab");
    params.delete("filter");
    if (tab === "activity") params.set("tab", "activity");
    const query = params.toString();
    router.replace(`/vault${query ? `?${query}` : ""}`, { scroll: false });
  }

  if (phase === "processing")
    return (
      <div className={`${styles.screen} ${styles.disasterScreen}`}>
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
      <div className={`${styles.screen} ${styles.disasterScreen}`}>
        <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
        <div className={styles.publicBack}>
          <button
            className={styles.backLink}
            type="button"
            onClick={() => {
              setDone(null);
              if (initialPhase === "amount") router.push("/vault");
              else setPhase("view");
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
      <div className={`${styles.screen} ${styles.disasterScreen}`}>
        <SubmissionStatusPanel guard={submission} onRefresh={refresh} />
        <div className={styles.publicBack}>
          <button
            type="button"
            className={styles.backLink}
            onClick={() => { if (initialPhase === "amount") router.push("/vault"); else setPhase("view"); }}
          >
            {Ico.back({ size: 14, c: T.action })} Disaster Vault
          </button>
          <span className={styles.publicBadge}>Stellar Testnet</span>
        </div>
        <section className={styles.publicHeader}>
          <div>
            <span className={styles.eyebrow}>Disaster Vault</span>
            <h1>Contribute</h1>
            <p>
              Add to the shared relief pool using your Testnet wallet.
            </p>
          </div>
        </section>
        {PREVIEW && (
          <div className={styles.previewNotice}>
            Local preview · example data
          </div>
        )}
        <div className={styles.detailCard}>
          <label className={styles.inputLabel} htmlFor="disaster-contribution">
            Amount · {CURRENCY[currency].code}
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
          <AvailableWalletBalance amountStroops={localToStroops(amount, currency)} />
          <div className={styles.contributionDestination} role="group" aria-label="Contribution destination">
            <span>To</span>
            <strong>Disaster Vault</strong>
          </div>
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
      <details className={styles.evidenceAppendix}>
        <summary>Recurring campaign rules, D5</summary>
        <p className={styles.amountNote}>
          Testnet XLM contributions fill scheduled stage targets in order. Each
          fully funded stage can be released after its due date when public
          proof has two approvals from its three configured reviewer wallets.
          After final review, donors can reclaim allocations to stages that
          have not released; released stages stay paid. The creator share is
          fixed at creation and is not a platform fee. Testnet receipts do not
          prove real-world delivery.
        </p>
        <section className={styles.detailCard}>
          <a className={styles.eventLink}
            href={`${EXPLORER}/contract/CDI6V4XTDDDAVW5GLJE6JOZ4AZO3TWCUJ54ZWYOTQFUNX4HXIJVPKK24`}
            target="_blank" rel="noopener noreferrer">
            <span>Recurring-campaign v5 · Testnet contract</span>
            {Ico.link({ size: 13, c: T.action })}
          </a>
          <Link className={styles.eventLink} href="/campaigns?mode=recurring">
            Explore recurring campaigns {Ico.link({ size: 13, c: T.action })}
          </Link>
          <Link className={styles.eventLink} href="/docs">
            Read the documented D5 rules {Ico.link({ size: 13, c: T.action })}
          </Link>
        </section>
      </details>
    </>
  );
  return (
    <div className={`${styles.screen} ${styles.disasterScreen} ${styles.prototypeVault}`}>
      <div className={styles.vaultPageHeader}>
        <button type="button" className={styles.backLink} onClick={goBack}>
          {Ico.back({ size: 18, c: T.ink })}
        </button>
        <h1>Disaster Vault</h1>
        <span className={styles.headerSpacer} aria-hidden="true" />
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Disaster Vault sections">
        {(["vault", "activity"] as const).map(tab => (
          <button
            key={tab}
            id={`disaster-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={activityView === (tab === "activity")}
            aria-controls={`disaster-panel-${tab}`}
            className={styles.tab}
            onClick={() => selectVaultTab(tab)}
          >
            {tab === "vault" ? "Vault" : "Activity"}
          </button>
        ))}
      </div>
      {!activityView ? (
        <>
          {PREVIEW ? (
            <article className={styles.featuredDisaster} aria-labelledby="featured-disaster-title">
              <div className={styles.disasterPhotos}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.disasterCover} src={PREVIEW_DISASTER.photos[0]} alt="Community members repairing a roof" />
                <div className={styles.disasterGallery}>
                  {PREVIEW_DISASTER.photos.slice(1).map((photo, index) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={photo} src={photo} alt={`Disaster response example ${index + 2}`} />
                  ))}
                </div>
              </div>
              <div className={styles.disasterFeatureCopy}>
                <span className={styles.disasterStatus}><i aria-hidden="true" /> Ongoing disaster</span>
                <h2 id="featured-disaster-title">{PREVIEW_DISASTER.title}</h2>
                <p className={styles.disasterLocation}>{PREVIEW_DISASTER.location}</p>
                <div className={styles.disasterProgress} role="progressbar" aria-label="Sample cause funding progress" aria-valuemin={0} aria-valuemax={PREVIEW_DISASTER.target} aria-valuenow={PREVIEW_DISASTER.raised}>
                  <span style={{ width: `${(PREVIEW_DISASTER.raised / PREVIEW_DISASTER.target) * 100}%` }} />
                </div>
                <p className={styles.disasterRaised}>
                  ${PREVIEW_DISASTER.raised.toFixed(2)} raised of ${PREVIEW_DISASTER.target.toFixed(2)}
                  {" · up to $321.05 of the vault can go to it"}
                </p>
                {PREVIEW ? <DisasterPartnersPreview view={ngoView} /> : null}
                <Link className={styles.disasterCauseLink} href="/cause/bantayan">View cause {Ico.chev({ size: 14, c: T.action })}</Link>
              </div>
            </article>
          ) : (
            <section className={styles.disasterEmpty} aria-labelledby="disaster-empty-title">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/illustrations/disaster-vault-empty.webp" alt="" />
              <div>
                <span className={styles.eyebrow}>Disaster response</span>
                <h2 id="disaster-empty-title">No verified disaster response yet</h2>
                <p>Cause details will appear here after the Salapi team confirms a response.</p>
              </div>
            </section>
          )}
          {!PREVIEW ? (
            <section className={styles.partnerState} aria-labelledby="disaster-partners-title">
              <span className={styles.eyebrow}>Disaster response partners</span>
              <h2 id="disaster-partners-title">No NGOs assigned yet</h2>
              <p>The Salapi team chooses the NGOs for this disaster.</p>
            </section>
          ) : null}
          <section className={styles.payoutDisclosure} aria-labelledby="payout-info-title">
            <h2 id="payout-info-title">How the vault pays out</h2>
            <p>Two of the three configured signer wallets must approve a payout. It then waits 20 Stellar ledgers before execution.</p>
            <div className={styles.payoutStats}>
              <span><small>Rolling 24-hour limit</small><strong>{pool?.ok ? `${pool.config.cap_bps / 100}% of the balance` : "Checking contract"}</strong></span>
              <span><small>Available now</small><strong>{pool?.ok ? `${formatStroops(pool.status.allowance)} XLM` : "Unavailable"}</strong></span>
            </div>
            <p>Contributions stay open while payouts are paused. The contract recalculates the limit when a payout is executed.</p>
          </section>
          <DisasterNgoDirectory />
          <details className={styles.controlsDisclosure} onToggle={(event) => setControlsOpen(event.currentTarget.open)}>
            <summary>On-chain approvals and signer controls</summary>
            {controlsOpen ? <DisasterControls pool={pool} onRefresh={refresh} publicProof={appendix} hideTabs /> : null}
          </details>
        </>
      ) : (
        <DisasterControls
          pool={pool}
          onRefresh={refresh}
          publicProof={appendix}
          hideTabs
          onContribute={() => {
            setErr("");
            router.push("/vault/contribute");
          }}
        />
      )}
      <details className={styles.evidenceAppendix}>
        <summary>Recurring campaign rules, D5</summary>
        <p className={styles.amountNote}>
          This local preview does not query or update D5. On Testnet, XLM
          contributions fill scheduled stage targets in order. Each fully
          funded stage needs public proof and two approvals from three
          configured reviewer wallets before release. After final review,
          donors can reclaim only allocations to stages that have not released.
        </p>
        <a className={styles.eventLink}
          href={`${EXPLORER}/contract/CDI6V4XTDDDAVW5GLJE6JOZ4AZO3TWCUJ54ZWYOTQFUNX4HXIJVPKK24`}
          target="_blank" rel="noopener noreferrer">
          <span>Reference D5 Testnet contract</span>
          {Ico.link({ size: 13, c: T.action })}
        </a>
        <Link className={styles.eventLink} href="/campaigns?mode=recurring">
          Preview recurring campaign flow {Ico.link({ size: 13, c: T.action })}
        </Link>
      </details>
      <footer className={styles.footer}>
        <PoweredByStellar />
        <span>Public proof on Stellar Testnet.</span>
      </footer>
    </div>
  );
}
