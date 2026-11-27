"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppBar, Btn, Card, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { PREVIEW_WALLET, previewUsdcBalanceCents } from "@/lib/local-preview";
import { Bank, Info } from "@phosphor-icons/react";
import { useGoBack } from "@/lib/ui/useGoBack";
import DisasterPartnersPreview from "@/components/screens/DisasterPartnersPreview";
import styles from "./PrototypeDisasterVaultScreen.module.css";

type LedgerRow = { id: string; dir: "in" | "out"; label: string; cents: number; by?: string; ngo?: string; group?: string; causeId?: string; cause?: string; donationCents?: number; when?: string; mine?: boolean };
type VaultState = { balanceCents: number; vaultCents: number; ledger: LedgerRow[] };
type ContributionReceipt = { id: string; amountCents: number; vaultCents: number };

const STORAGE_KEY = "salapi.local-preview.disaster-vault.v1";
const RECEIPT_KEY = "salapi.local-preview.disaster-vault.receipt.v1";
const INITIAL_STATE: VaultState = {
  balanceCents: 241_226,
  vaultCents: 128_420,
  ledger: [
    { id: "l1", dir: "in", label: "1% of a $5.00 donation", cents: 5, donationCents: 500, by: "maria_s", causeId: "mei", cause: "Ate Mei needs dialysis" },
    { id: "l2", dir: "in", label: "1% of a $25.00 donation", cents: 25, donationCents: 2500, by: "jamamam", causeId: "bantayan", cause: "Bantayan Island school roofs" },
    { id: "l3", dir: "in", label: "1% of a $12.00 donation", cents: 12, donationCents: 1200, by: "jamal_r", causeId: "santos-roof", cause: "Santos family roof" },
    { id: "l4", dir: "out", label: "NGO payout", cents: 50_000, ngo: "tulong-cebu", group: "Typhoon relief, Cebu", when: "12 Oct 2026" },
  ],
};
const NGOS = [
  { id: "tulong-cebu", name: "Tulong Cebu Relief" },
  { id: "bangon-marikina", name: "Bangon Marikina" },
  { id: "dapur-siaga", name: "Dapur Siaga Jakarta" },
];
const PHOTOS = [
  "/prototype-causes/campaign-bantayan.jpg",
  "/prototype-causes/bantayan-panels.jpg",
  "/prototype-causes/bantayan-materials.jpg",
  "/prototype-causes/bantayan-boats.jpg",
];
const usd = (cents: number) => `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const xlm = (cents: number, digits = 0) => ((cents / 100) * 8.92307692).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
function readLocalState(): VaultState {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<VaultState> | null;
    if (value && Number.isSafeInteger(value.balanceCents) && Number.isSafeInteger(value.vaultCents) && Array.isArray(value.ledger)) {
      return { balanceCents: value.balanceCents!, vaultCents: value.vaultCents!, ledger: value.ledger as LedgerRow[] };
    }
  } catch { /* Local sample data can be reset by clearing browser storage. */ }
  return { ...INITIAL_STATE, balanceCents: previewUsdcBalanceCents() };
}

function writeLocalState(value: VaultState) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Continue this interaction in memory if storage is unavailable. */ }
}

function PrototypeHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return <AppBar leading={<IconButton ariaLabel="Back" onClick={onBack}>{Ico.back({})}</IconButton>} title={title} />;
}

function PhotoGallery() {
  const [open, setOpen] = useState<number | null>(null);
  return <>
    <div className={styles.photos} aria-label="Bantayan Island project photos">
      {PHOTOS.map((src, index) => <button type="button" key={src} aria-label={`Open photo ${index + 1} of ${PHOTOS.length} for Bantayan Island school roofs`} onClick={() => setOpen(index)}>
        {/* Native img keeps these exact prototype assets crisp inside the compact gallery. */}
        <img src={src} alt="" />
      </button>)}
    </div>
    {open !== null ? <div className={styles.lightbox} role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(null); }}>
      <button type="button" className={styles.closePhoto} aria-label="Close photo" onClick={() => setOpen(null)}>{Ico.x({ size: 22 })}</button>
      <button type="button" aria-label="Previous photo" onClick={() => setOpen((open + PHOTOS.length - 1) % PHOTOS.length)}>{Ico.back({ size: 24 })}</button>
      <img src={PHOTOS[open]} alt={`Bantayan Island school roof project, photo ${open + 1}`} />
      <button type="button" aria-label="Next photo" onClick={() => setOpen((open + 1) % PHOTOS.length)}>{Ico.chev({ size: 24 })}</button>
    </div> : null}
  </>;
}

export function PrototypeDisasterVaultScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const back = useGoBack("/");
  const activity = params.get("tab") === "activity";
  const [state, setState] = useState<VaultState>(INITIAL_STATE);
  const [filter, setFilter] = useState(params.get("filter") === "in" || params.get("filter") === "out" ? params.get("filter")! : "all");
  const release = Math.round(state.vaultCents * 0.25);
  const contributions = useMemo(() => state.ledger.filter(row => row.dir === "in"), [state.ledger]);
  const payouts = useMemo(() => state.ledger.filter(row => row.dir === "out"), [state.ledger]);
  const payoutTotal = payouts.reduce((sum, row) => sum + row.cents, 0);

  useEffect(() => { setState(readLocalState()); }, []);
  useEffect(() => { const value = params.get("filter"); setFilter(value === "in" || value === "out" ? value : "all"); }, [params]);

  function setTab(nextActivity: boolean) {
    const query = new URLSearchParams(params.toString());
    query.delete("filter");
    if (nextActivity) query.set("tab", "activity"); else query.delete("tab");
    router.replace(`/vault${query.size ? `?${query}` : ""}`, { scroll: false });
  }

  function setActivityFilter(next: string) {
    setFilter(next);
    const query = new URLSearchParams(params.toString());
    query.set("tab", "activity");
    if (next === "all") query.delete("filter"); else query.set("filter", next);
    router.replace(`/vault?${query}`, { scroll: false });
  }

  return <div className={styles.screen}>
    <PrototypeHeader title="Disaster Vault" onBack={back} />
    <div className={styles.tabs} role="tablist" aria-label="Disaster Vault sections">
      <button type="button" role="tab" aria-selected={!activity} onClick={() => setTab(false)}>Vault</button>
      <button type="button" role="tab" aria-selected={activity} onClick={() => setTab(true)}>Activity</button>
    </div>

    {!activity ? <>
      <Card p={0} className={styles.disasterCard}>
        <PhotoGallery />
        <div className={styles.disasterBody}>
          <p className={styles.live}><span aria-hidden="true" />Ongoing disaster</p>
          <h1>Bantayan Island - new<br />roofs for a barangay school</h1>
          <p className={styles.location}>Cebu, PH</p>
          <div className={styles.progress} role="img" aria-label="$318.50 raised of $600.00"><span /></div>
          <p className={styles.progressText}>$318.50 raised of $600.00{state.vaultCents > 0 ? ` · up to ${usd(release)} of the vault can go to it` : ""}</p>
          <DisasterPartnersPreview view={params.get("ngo")} />
          <Btn kind="secondary" onClick={() => router.push("/cause/bantayan")}>View cause</Btn>
        </div>
      </Card>
      <Card p={16} className={styles.explainer}>
        <h2>How the vault pays out</h2>
        <p>Every donation adds 1% to this pool. Up to 25% of it can be released to any one disaster, through an NGO on the ground.</p>
        <div className={styles.amountRows}><span>In the pool</span><strong>{usd(state.vaultCents)}</strong></div>
        <div className={styles.amountRows}><span>Can go to one disaster (25%)</span><strong>{usd(release)}</strong></div>
      </Card>
    </> : <>
      <Card p={0} className={styles.bankCard}>
        <img className={styles.bankArt} src={state.vaultCents > 0 ? "/prototype-ui/disaster-vault-funded.webp" : "/prototype-ui/disaster-vault-empty.webp"} alt="" />
        <div className={styles.bankSummary}>
          <div className={styles.balanceCaption}>Shared pool balance <button type="button" aria-label="How the vault pays out" onClick={() => (document.getElementById("vault-payout-info") as HTMLDialogElement | null)?.showModal()}><Info size={16} weight="fill" aria-hidden="true" /></button></div>
          <strong className={styles.balance}>{usd(state.vaultCents)}</strong>
          <span className={styles.balanceSub}>≈ {xlm(state.vaultCents)} XLM</span>
          <span className={styles.balanceSub}>{state.ledger.filter(row => row.dir === "in").length === 0 ? "Nothing has come in yet" : `From ${state.ledger.filter(row => row.dir === "in").length} contributions`}</span>
          {state.vaultCents === 0 ? <div className={styles.emptyCopy}><strong>Unfortunately, the vault is empty right now.</strong><p>Nothing can be released from it today. If people need help now, start an urgent cause and donors can give to it directly.</p><Btn kind="secondary" onClick={() => router.push("/create")}>Create an urgent cause</Btn></div> : null}
          <Btn onClick={() => router.push("/vault/contribute")}>Contribute</Btn>
        </div>
      </Card>
      <div className={styles.activityHeading}><h2>Activity</h2></div>
      <div className={styles.activityFilters} role="tablist" aria-label="Filter activity">
        {[ ["all", "All"], ["in", "Contributions"], ["out", "NGO payouts"] ].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={filter === value} onClick={() => setActivityFilter(value)}>{label}</button>)}
      </div>
      {(filter === "all" || filter === "out") && <section className={styles.payoutBlock} aria-label="NGO payouts">
        <div className={styles.groupHeader}><span className={styles.payoutMark}><Bank size={18} aria-hidden="true" /></span><span className={styles.payoutTitle}><strong>NGO payouts</strong><small>Money the vault sent to relief groups on the ground</small></span>{payouts.length > 0 && <b>{usd(payoutTotal)}</b>}</div>
        {payouts.length === 0 ? <p className={styles.noActivity}>No payouts yet</p> : payouts.map(row => {
          const ngo = NGOS.find(item => item.id === row.ngo);
          return <Link href={`/ngo/${ngo?.id ?? "tulong-cebu"}`} className={styles.ledgerRow} key={row.id}>
            <span><strong>{row.group ?? row.label}</strong><small><em>NGO</em>{ngo ? `To ${ngo.name}` : "To an NGO"}</small></span><span className={styles.payoutValue}><b>−{usd(row.cents)}</b>{row.when && <small>{row.when}</small>}</span>{ngo ? <span className={styles.rowArrow}>{Ico.chev({ size: 15 })}</span> : null}
          </Link>;
        })}
      </section>}
      {(filter === "all" || filter === "in") && <>
        <div className={styles.contributionHeading}><h3>Contributions</h3><span>1% of every donation</span></div>
        <section className={styles.ledger} aria-label="Contributions">
          {contributions.length === 0 ? <p className={styles.noActivity}>No contributions yet</p> : contributions.map(row => {
            const content = <><span><strong>@{row.by ?? "salapi_user"}</strong><small>{row.causeId && row.donationCents ? `Donated ${usd(row.donationCents)} to ${row.cause ?? row.label.replace(/^Donated [^ ]+ to /, "")}` : row.label}</small></span><b>+{usd(row.cents)}</b></>;
            return row.causeId ? <Link href={`/cause/${row.causeId}`} className={styles.ledgerRow} key={row.id}>{content}</Link> : <div className={styles.ledgerRow} key={row.id}>{content}</div>;
          })}
        </section>
      </>}
    </>}

    <div className={styles.powered}><PoweredByStellar /></div>
    <dialog className={styles.infoDialog} id="vault-payout-info"><h2>How the vault pays out</h2><p>Up to 25% of the pool can be released to any one disaster. Today that is {usd(release)}. The rest stays in the vault for the next one.</p><form method="dialog"><Btn>Got it</Btn></form></dialog>
  </div>;
}

export function PrototypeDisasterVaultContributeScreen() {
  const router = useRouter();
  const back = useGoBack("/vault");
  const [state, setState] = useState<VaultState>(INITIAL_STATE);
  const [amount, setAmount] = useState("");
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setState(readLocalState()); }, []);
  useEffect(() => { setPortalHost(document.getElementById("phone-layer")); }, []);
  const cents = /^\d{1,6}(?:\.\d{0,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : null;
  const valid = cents !== null && cents >= 100 && cents <= state.balanceCents;
  const validationError = amount === "" ? "" : cents === null || cents < 100 ? "Enter $1 or more." : cents > state.balanceCents ? `That is more than your Salapi balance of ${usd(state.balanceCents)}.` : "";

  function contribute() {
    if (!valid || cents === null) return;
    const id = `vault-${Date.now().toString(36)}`;
    const next: VaultState = {
      balanceCents: state.balanceCents - cents,
      vaultCents: state.vaultCents + cents,
      ledger: [{ id, dir: "in", label: "Your contribution", cents, mine: true, by: PREVIEW_WALLET.handle, when: "Just now" }, ...state.ledger],
    };
    const receipt: ContributionReceipt = { id, amountCents: cents, vaultCents: next.vaultCents };
    setState(next);
    writeLocalState(next);
    try { window.localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt)); } catch { /* The local receipt route still opens with its URL. */ }
    router.push(`/vault/success/${id}`);
  }

  return <div className={`${styles.screen} ${styles.flowScreen}`}>
    <PrototypeHeader title="Contribute" onBack={back} />
    <div className={styles.shortBody}>
      <section className={styles.amountCard} aria-label="Contribution amount">
        <label htmlFor="vault-amount">Amount · USD</label>
        <div className={styles.amountInputWrap}>
          <span>$</span>
          <input id="vault-amount" inputMode="decimal" autoComplete="off" placeholder="0" value={amount} style={{ width: `${Math.max(1, amount.length)}ch` }} onChange={event => { if (/^\d{0,6}(?:\.\d{0,2})?$/.test(event.target.value)) setAmount(event.target.value); }} />
        </div>
        <p className={styles.equivalent}>{cents !== null && cents > 0 ? <>≈ {xlm(cents, 2)} XLM</> : null}{validationError ? <span role="alert" className={styles.amountError}>{validationError}</span> : null}</p>
        <div className={styles.presets}>{[200, 500, 1000, 2000].map(value => <button key={value} type="button" aria-pressed={amount === String(value / 100)} disabled={value > state.balanceCents} onClick={() => setAmount(String(value / 100))}>{usd(value).replace(".00", "")}</button>)}</div>
      </section>
      <section className={styles.amountInfo}>
        <div><span>From your balance</span><strong>{usd(state.balanceCents)}</strong></div>
        <div><span>To</span><strong>Disaster Vault</strong></div>
      </section>
      <div className={styles.shortDoodle} aria-hidden="true"><div><img src="/prototype-ui/doodle-vault.png" alt="" /></div></div>
    </div>
    {portalHost ? createPortal(<div className={styles.cta}><Btn disabled={!valid} onClick={contribute}>Contribute</Btn></div>, portalHost) : null}
  </div>;
}

export function PrototypeDisasterVaultSuccessScreen({ id }: { id: string }) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<ContributionReceipt | null>(null);
  useEffect(() => {
    try {
      const value = JSON.parse(window.localStorage.getItem(RECEIPT_KEY) ?? "null") as ContributionReceipt | null;
      if (value?.id === id && Number.isSafeInteger(value.amountCents) && Number.isSafeInteger(value.vaultCents)) setReceipt(value);
    } catch { /* A missing local receipt is handled with the fallback message below. */ }
  }, [id]);
  return <div className={`${styles.screen} ${styles.flowScreen}`}>
    <PrototypeHeader title="Contribution" onBack={() => router.push("/vault")} />
    {receipt ? <section className={styles.successCard}>
      <span className={styles.successMark}>{Ico.check({ size: 24 })}</span>
      <p className={styles.successEyebrow}>Saved in this browser</p>
      <h1>You gave {usd(receipt.amountCents)} to the Disaster Vault</h1>
      <p>The vault now holds {usd(receipt.vaultCents)}.</p>
      <div className={styles.receiptRows}><div><span>To</span><strong>Disaster Vault</strong></div><div><span>Amount</span><strong>{usd(receipt.amountCents)}</strong></div><div><span>Network</span><strong>Local preview</strong></div><div><span>Status</span><strong>Saved locally</strong></div></div>
      <p className={styles.localNote}>This is an example receipt. No funds moved and no Stellar transaction was submitted.</p>
      <Btn onClick={() => router.push("/vault?tab=activity")}>Done</Btn>
    </section> : <section className={styles.successCard}><h1>Receipt not found</h1><p>This local preview receipt may have been cleared from browser storage.</p><Btn onClick={() => router.push("/vault")}>Back to Disaster Vault</Btn></section>}
  </div>;
}
