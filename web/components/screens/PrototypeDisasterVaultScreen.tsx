"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppBar, Btn, Card, Ico, IconButton, PoweredByStellar } from "@/components/ui/kit";
import { useGoBack } from "@/lib/ui/useGoBack";
import DisasterPartnersPreview from "@/components/screens/DisasterPartnersPreview";
import styles from "./PrototypeDisasterVaultScreen.module.css";

type LedgerRow = { id: string; dir: "in" | "out"; label: string; cents: number; by?: string; ngo?: string; when?: string; mine?: boolean };
type VaultState = { balanceCents: number; vaultCents: number; ledger: LedgerRow[] };
type ContributionReceipt = { id: string; amountCents: number; vaultCents: number };

const STORAGE_KEY = "salapi.local-preview.disaster-vault.v1";
const RECEIPT_KEY = "salapi.local-preview.disaster-vault.receipt.v1";
const INITIAL_STATE: VaultState = {
  balanceCents: 241_226,
  vaultCents: 128_420,
  ledger: [
    { id: "l1", dir: "in", label: "1% of a $5.00 donation", cents: 5, by: "maria_s" },
    { id: "l2", dir: "in", label: "1% of a $25.00 donation", cents: 25, by: "jamamam" },
    { id: "l3", dir: "in", label: "1% of a $12.00 donation", cents: 12, by: "jamal_r" },
    { id: "l4", dir: "out", label: "Typhoon relief, Cebu", cents: 50_000, ngo: "tulong-cebu", when: "12 Oct 2026" },
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
  return INITIAL_STATE;
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
  const [filter, setFilter] = useState(params.get("filter") ?? "all");
  const release = Math.round(state.vaultCents * 0.25);
  const rows = useMemo(() => state.ledger.filter(row => filter === "all" || (filter === "in" ? row.dir === "in" : filter === "out" ? row.dir === "out" : row.ngo === filter)), [filter, state.ledger]);

  useEffect(() => { setState(readLocalState()); }, []);
  useEffect(() => { setFilter(params.get("filter") ?? "all"); }, [params]);

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
          <div className={styles.balanceCaption}>Shared pool balance <button type="button" aria-label="How the vault pays out" onClick={() => (document.getElementById("vault-payout-info") as HTMLDialogElement | null)?.showModal()}>ⓘ</button></div>
          <strong className={styles.balance}>{usd(state.vaultCents)}</strong>
          <span className={styles.balanceSub}>≈ {xlm(state.vaultCents)} XLM</span>
          <span className={styles.balanceSub}>{state.ledger.filter(row => row.dir === "in").length === 0 ? "Nothing has come in yet" : `From ${state.ledger.filter(row => row.dir === "in").length} contributions`}</span>
          {state.vaultCents === 0 ? <div className={styles.emptyCopy}><strong>Unfortunately, the vault is empty right now.</strong><p>Nothing can be released from it today. If people need help now, start an urgent cause and donors can give to it directly.</p><Btn kind="secondary" onClick={() => router.push("/create")}>Create an urgent cause</Btn></div> : null}
          <Btn onClick={() => router.push("/vault/contribute")}>Contribute</Btn>
        </div>
      </Card>
      <div className={styles.activityHeading}><h2>Activity</h2><label>Show<select aria-label="Show" value={filter} onChange={event => setActivityFilter(event.target.value)}>
        <option value="all">All activity</option><option value="in">Contributions</option><option value="out">NGO payouts</option>{NGOS.map(ngo => <option value={ngo.id} key={ngo.id}>{ngo.name}</option>)}
      </select></label></div>
      <section className={styles.ledger} aria-label="Disaster Vault activity">
        {rows.length === 0 ? <p className={styles.noActivity}>{NGOS.some(ngo => ngo.id === filter) ? "No payouts to this NGO yet" : "No activity yet"}</p> : rows.map(row => {
          const ngo = NGOS.find(item => item.id === row.ngo);
          return ngo ? <Link href={`/ngo/${ngo.id}`} className={styles.ledgerRow} key={row.id}>
            <span><strong>{row.label}</strong><small><em>NGO</em>To {ngo.name}{row.when ? ` · ${row.when}` : ""}</small></span><b>{row.dir === "in" ? "+" : "−"}{usd(row.cents)}</b>
          </Link> : <div className={styles.ledgerRow} key={row.id}>
            <span><strong>{row.by ? `@${row.by}` : row.label}</strong>{row.by ? <small>{row.label}</small> : null}</span><b>+{usd(row.cents)}</b>
          </div>;
        })}
      </section>
      {NGOS.some(ngo => ngo.id === filter) ? <Link className={styles.viewNgo} href={`/ngo/${filter}`}>View NGO profile {Ico.chev({ size: 15 })}</Link> : null}
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
  const [error, setError] = useState("");
  useEffect(() => { setState(readLocalState()); }, []);
  const cents = /^\d{1,6}(?:\.\d{0,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : null;
  const valid = cents !== null && cents >= 100 && cents <= state.balanceCents;

  function contribute() {
    if (!valid || cents === null) return;
    const id = `vault-${Date.now().toString(36)}`;
    const next: VaultState = {
      balanceCents: state.balanceCents - cents,
      vaultCents: state.vaultCents + cents,
      ledger: [{ id, dir: "in", label: "Your contribution", cents, mine: true, by: "ariqhermawan", when: "Just now" }, ...state.ledger],
    };
    const receipt: ContributionReceipt = { id, amountCents: cents, vaultCents: next.vaultCents };
    setState(next);
    writeLocalState(next);
    try { window.localStorage.setItem(RECEIPT_KEY, JSON.stringify(receipt)); } catch { /* The local receipt route still opens with its URL. */ }
    router.push(`/vault/success/${id}`);
  }

  return <div className={`${styles.screen} ${styles.flowScreen}`}>
    <PrototypeHeader title="Contribute" onBack={back} />
    <section className={styles.amountCard} aria-label="Contribution amount">
      <label htmlFor="vault-amount">Amount · USD</label>
      <div className={styles.amountInputWrap}><span>$</span><input id="vault-amount" inputMode="decimal" placeholder="0" value={amount} onChange={event => { setAmount(event.target.value); setError(""); }} /></div>
      <div className={styles.presets}>{[200, 500, 1000, 2000].map(value => <button key={value} type="button" onClick={() => { setAmount(String(value / 100)); setError(""); }}>{usd(value).replace(".00", "")}</button>)}</div>
      {cents && cents > 0 ? <p className={styles.equivalent}>≈ {xlm(cents, 2)} XLM</p> : <p className={styles.equivalent}>Available balance {usd(state.balanceCents)}</p>}
      {error ? <p role="alert" className={styles.amountError}>{error}</p> : null}
    </section>
    <section className={styles.amountInfo}>
      <div><span>From your balance</span><strong>{usd(state.balanceCents)}</strong></div>
      <div><span>To</span><strong>Disaster Vault</strong></div>
    </section>
    <img className={styles.doodle} src="/prototype-ui/doodle-vault.png" alt="" />
    <div className={styles.cta}><Btn onClick={() => {
      if (cents === null || cents < 100) { setError("Enter $1 or more."); return; }
      if (cents > state.balanceCents) { setError(`That is more than your Salapi balance of ${usd(state.balanceCents)}.`); return; }
      contribute();
    }}>Contribute</Btn><p>Local preview only. This will not send a transaction.</p></div>
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
