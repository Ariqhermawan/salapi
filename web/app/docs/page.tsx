import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { disasterId, donationCampaignId } from "@/lib/server/stellar";
import { isLocalPreview } from "@/lib/local-preview";
import { PoweredByStellarV2 } from "@/components/ui/brand";
import styles from "@/components/screens/CampaignArisan.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public documentation · Salapi",
  description:
    "A reviewer-friendly guide to Salapi's Stellar Testnet app, contracts, evidence, and current limitations.",
};

const contracts = [
  {
    name: "base-vault",
    id: "CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD",
    source: "contracts/base-vault",
  },
  {
    name: "username-registry",
    id: "CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3",
    source: "contracts/username-registry",
  },
  {
    name: "disaster (historical, single-admin)",
    id: "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ",
    source: "contracts/disaster",
  },
  {
    name: "paluwagan",
    id: "CCXNSK6IGPSB4QGUSNB2EFZWYV53NKVX5AV3XSJANCDDD7TULGQSY37X",
    source: "contracts/paluwagan",
  },
  {
    name: "smart-savings",
    id: "CBQBUAOP3T235Q2U63XNC2NQVNAOXQL2KHWALO6FTIOJS46NTKIZJ5WI",
    source: "contracts/smart-savings",
  },
  {
    name: "arisan-rooms",
    id: "CDFIM3DPANUDSZJUMVFYOGCMMWUS545KDIZQIHBZWMWCA4THFKCPVB6N",
    source: "contracts/arisan_rooms",
  },
  {
    name: "arisan-rooms (long cadence)",
    id: "CAYJ7G3CPT5LYKV2P5E4GL7TNVDQKMMW6SA4WA4QYQZKCNLK45GE4VUL",
    source: "contracts/arisan_rooms",
  },
];

const externalLinkStyle = {
  color: "#1d4ed8",
  fontWeight: 650,
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #e1e7f0",
  borderRadius: 24,
  padding: 22,
};

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={externalLinkStyle}>
      {children}
    </a>
  );
}

export default function PublicDocsPage() {
  const d3 = disasterId();
  const d4 = donationCampaignId();
  const displayedContracts = [...contracts];
  if (d3) displayedContracts.push({ name: "disaster (D3 configured deployment)", id: d3, source: "contracts/disaster" });
  if (d4) displayedContracts.push({ name: "donation-campaign (D4)", id: d4, source: "contracts/donation-campaign" });
  const sourceRef = process.env.VERCEL_GIT_COMMIT_SHA ?? "main";
  return (
    <div
      style={{
        minHeight: "100%",
        padding: "18px 20px 45px",
        color: "#10203a",
        fontFamily: "var(--font-geist-sans)",
      }}
    >
      <div className={styles.toolbar} style={{ marginBottom: 20 }}><Link href="/">← Back to Salapi</Link><span className={styles.badge}>Public · No login</span></div>
      <header className={styles.hero}>
        <div>
        <div style={{ color: "#1d4ed8", fontSize: 11, fontWeight: 750, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Salapi · public documentation
        </div>
        <h1 style={{ margin: "7px 0 0", fontSize: 30, lineHeight: 1.08, letterSpacing: "-0.035em" }}>
          Rules you can read.<br />Proof you can check.
        </h1>
        <p style={{ margin: "10px 0 0", color: "#5b6472", fontSize: 14, lineHeight: 1.55 }}>
          A guide to donation campaigns, shared money pools and public receipts.
          Check the terms, then inspect the Testnet evidence.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <span style={{ borderRadius: 999, background: "#fff7ed", color: "#9a3412", padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
            STELLAR TESTNET
          </span>
        </div>
        </div><Image src="/illustrations/disaster.png" width={112} height={112} className={styles.doodle} alt="Hands supporting a community vault" />
      </header>
      {isLocalPreview && <p className={styles.notice} style={{ marginTop: 15 }}>You are viewing a local design preview. Example balances and actions do not query or update a deployed contract. The receipt links below point to archived Testnet evidence.</p>}

      <nav
        aria-label="Documentation sections"
        style={{ display: "flex", gap: 8, overflowX: "auto", padding: "20px 0", whiteSpace: "nowrap", fontSize: 12 }}
      >
        {[ ["#rules", "The rules"], ["#overview", "Overview"], ["#contracts", "Contracts"], ["#evidence", "Evidence"], ["#status", "Status"] ].map(([href,label]) => <a key={href} href={href} className={styles.filter}>{label}</a>)}
      </nav>

      <div style={{ display: "grid", gap: 16 }}>
        <section id="rules" className={styles.card}>
          <span className={styles.eyebrow}>Different pools, different rules</span><h2 style={{ fontSize: 23, letterSpacing: "-.035em", fontWeight: 750, margin: "9px 0 20px" }}>Choose the right flow.</h2>
          <div className={styles.stack}>
            <div><h3>Donation campaigns · D4</h3><p className={styles.muted}>Each campaign has its own escrow, locked recipients, a 0 to 10% creator share, three approvers, and funding/review deadlines. After funding closes, two wallets approve the same proof before the deadline. After quorum, anyone can release to the fixed recipients. If timely approval is incomplete, each donor claims their own full contribution back.</p><Link href="/campaigns?mode=testnet" className={styles.textButton}>Explore campaigns →</Link></div>
            <div className={styles.terms}><h3>Disaster Vault · D3</h3><p className={styles.muted}>A shared relief pool with three fixed signer wallets. Payouts need two approvals, then wait 20 ledgers. Execution rechecks a rolling 24-hour limit of 20% of the current balance. Pause and unpause need quorum. Contributions remain open while paused.</p><Link href="/transparency" className={styles.textButton}>View Disaster Vault and public proof →</Link></div>
            <div className={styles.terms}><h3>Arisan Rooms</h3><p className={styles.muted}>Members fund N × their share upfront for N rounds. The draw uses participant commitments and reveals, then a finalization call pays the selected eligible member. A host still starts a full room. This is a rotating pool, with no interest or yield.</p><Link href="/arisan" className={styles.textButton}>View Arisan Rooms →</Link></div>
          </div>
          <p className={styles.notice} style={{ marginTop: 18 }}>D4 donation campaigns do not use D3&apos;s 20-ledger wait or spending cap. Wallet approvals and public receipts do not prove real-world delivery.</p>
        </section>
        <section id="overview" style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>What Salapi solves</h2>
          <p style={{ margin: "9px 0 0", color: "#5b6472", fontSize: 13.5, lineHeight: 1.6 }}>
            In an informal arisan or paluwagan, one person commonly holds the
            pot and runs the process. Salapi puts the pool rules and accounting
            in Soroban contracts instead. Contributions, payouts, and draws
            leave public Stellar receipts that anyone can inspect.
          </p>
          <p style={{ margin: "9px 0 0", color: "#5b6472", fontSize: 13.5, lineHeight: 1.6 }}>
            The app shows familiar peso or rupiah amounts. The server validates
            the input and converts it once to an integer stroop amount before
            sending it to Stellar; no floating-point money value is passed to a
            contract.
          </p>
        </section>

        <section id="architecture" style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>How it works</h2>
          <ol style={{ margin: "10px 0 0", paddingLeft: 20, color: "#5b6472", fontSize: 13.5, lineHeight: 1.65 }}>
            <li>The PWA collects a user-friendly amount and action.</li>
            <li>Server actions resolve the wallet, validate the request, and build the transaction.</li>
            <li>Soroban RPC submits the signed transaction to Stellar Testnet.</li>
            <li>The UI returns a receipt link so the result can be checked independently.</li>
          </ol>
          <p style={{ margin: "11px 0 0", color: "#5b6472", fontSize: 13, lineHeight: 1.55 }}>
            The web layer uses <code>@stellar/stellar-sdk</code> 15.1.0 and the
            contracts use Soroban SDK 22. The current test asset is native XLM
            through its Stellar Asset Contract; it has no real-world value.
          </p>
        </section>

        <section id="contracts" style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Testnet contracts</h2>
          <p style={{ margin: "8px 0 12px", color: "#5b6472", fontSize: 13.5, lineHeight: 1.55 }}>
            These are recorded Salapi Testnet contract deployments. Historical
            single-admin Disaster evidence is separate from the D3 deployment.
            Arisan has separate demo- and long-cadence deployments compiled
            from the same source.
          </p>
          <details><summary style={{ cursor: "pointer", fontWeight: 650, color: "#2563eb", fontSize: 13 }}>Contract addresses and source packages</summary><div style={{ display: "grid", gap: 14, marginTop: 15 }}>
            {displayedContracts.map((contract) => (
              <div key={contract.name} style={{ borderTop: "1px solid #eef0f4", paddingTop: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ fontSize: 13.5 }}>{contract.name}</strong>
                  <span style={{ color: "#5b6472", fontSize: 11 }}>{contract.source}</span>
                </div>
                <ExternalLink href={`https://stellar.expert/explorer/testnet/contract/${contract.id}`}>
                  <code style={{ display: "block", marginTop: 4, color: "#1d4ed8", fontSize: 10.5, overflowWrap: "anywhere" }}>
                    {contract.id}
                  </code>
                </ExternalLink>
              </div>
            ))}
          </div></details>
          <p style={{ color: "#5b6472", fontSize: 12.5, lineHeight: 1.5 }}>
            {isLocalPreview ? "Local preview uses example state. These addresses and source links are reference evidence; this page does not claim a live deployment verification."
              : d3 ? "The configured D3 address comes from the same setting used by application transactions. Transparency checks its on-chain configuration before enabling actions."
              : "This environment has no D3 deployment configured. D3 actions do not fall back to the historical single-admin contract."}
          </p>
          <p style={{ margin: "12px 0 0", color: "#5b6472", fontSize: 12.5, lineHeight: 1.5 }}>
            Full deploy, initialization, and flow transaction hashes are in the
            <ExternalLink href="https://github.com/Ariqhermawan/salapi/blob/main/docs/operations/deployments.md">
              deployment evidence log
            </ExternalLink>.
          </p>
        </section>

        <section id="evidence" style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Public evidence</h2>
          <p style={{ margin: "8px 0 0", color: "#5b6472", fontSize: 13.5, lineHeight: 1.55 }}>
            Start with the live app, then open the transparency page or a Stellar
            Expert link to verify the underlying network activity.
          </p>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#5b6472", fontSize: 13.5, lineHeight: 1.75 }}>
            <li><Link href="/" style={externalLinkStyle}>Open the application</Link></li>
            <li><Link href="/transparency" style={externalLinkStyle}>Open transparency</Link></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/pull/3">Week 1 Deliverable 1 pull request</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/blob/main/docs/instawards/week-1-d1.md">Week 1 D1 report</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/a670f325bce65a8ec093499cad43699269efddcd5d939a9403ca52eafcff7579">Example 6.50 PHP Testnet contribution</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/blob/main/docs/instawards/week-2-d2.md">Week 2 D2 commit-reveal report</ExternalLink></li>
            <li><ExternalLink href={`https://github.com/Ariqhermawan/salapi/blob/${sourceRef}/docs/instawards/week-3-d3.md`}>D3 controls, acceptance tests, and deployment status</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/pull/10">D3 implementation PR #10</ExternalLink></li>
            <li><Link href="/campaigns?mode=testnet" style={externalLinkStyle}>D4 donation campaigns</Link></li>
            <li><ExternalLink href={`https://github.com/Ariqhermawan/salapi/blob/${sourceRef}/docs/instawards/week-4-d4.md`}>D4 release/refund evidence and security self-review</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/pull/11">D4 implementation PR #11</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/pull/13">D4 browser acceptance archive PR #13</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/443a9e58e88d2758c7f74a017505c53a759c80e84692a4503037ed0011497a87">Archived campaign #5 payout: 0.05 + 0.95 Testnet XLM</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/f83d24369795458db27a033e921ce84c261840ca29019baaa151dcb1518e50cb">D2 normal round: three reveals</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/1fc95b8cbd2c5a3f54e5b44f0dad88aac55df5af30e5e1c7a0e9fb6ab5a7d0bc">D2 timeout round: one non-revealer</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/89734260b9a5c1bb099ed65f26a0f815059aea5d6b6fb8aa27f3c7c5c9a256b0">D2 no-reveal liveness fallback</ExternalLink></li>
          </ul>
        </section>

        <section id="status" style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Current status and boundaries</h2>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#5b6472", fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Stellar Testnet only. No real donations, fiat payments or mainnet funds.</li>
            <li>The milestone reports above archive D1 integer amount handling and D2 participant commit-reveal acceptance. Historical acceptance does not verify every current session.</li>
            <li>D3 implements fixed 2-of-3 approvals, a 20-ledger payout timelock, a rolling 24-hour cap, and quorum-controlled pause/unpause. Live cutover and evidence status are tracked in the D3 report.</li>
            <li>D4 escrows each campaign separately, fixes its three approvers and creator share at creation, requires two approvals of the same proof, and supports full donor-claimed refunds if review expires incomplete. The Testnet asset is fixed at deployment. D4 has no D3 spending cap or 20-ledger wait.</li>
            <li>Independent audit, independent signer custody, and fiat anchor integration remain outside this Testnet implementation.</li>
            <li>Current wallets are managed by Salapi. Three distinct signer wallets do not establish three independent organizations or independent key custody.</li>
            <li>Smart Savings is coming soon in this product experience. Its Testnet contract source remains listed as technical reference.</li>
          </ul>
          <p style={{ margin: "12px 0 0", color: "#5b6472", fontSize: 12.5, lineHeight: 1.5 }}>
            Security assumptions, custody trade-offs, and the mainnet checklist
            are documented in the repository&apos;s
            <ExternalLink href="https://github.com/Ariqhermawan/salapi/blob/main/SECURITY.md"> security policy</ExternalLink>.
          </p>
        </section>
      </div>

      <footer style={{ marginTop: 18, paddingBottom: 8, color: "#7a8494", fontSize: 11.5, lineHeight: 1.5 }}>
        <ExternalLink href="https://github.com/Ariqhermawan/salapi">Source code on GitHub</ExternalLink>
        <span aria-hidden> · </span>
        <Link href="/" style={{ color: "#7a8494" }}>Back to Salapi</Link>
        <span aria-hidden> · </span><Link href="/privacy">Privacy notice</Link><span aria-hidden> · </span><Link href="/terms">Testnet terms</Link>
        <div style={{ marginTop: 20 }}><PoweredByStellarV2 size={12} /></div>
      </footer>
    </div>
  );
}
