import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

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
    name: "disaster",
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
  border: "1px solid #e6e8ee",
  borderRadius: 16,
  padding: 16,
};

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={externalLinkStyle}>
      {children}
    </a>
  );
}

export default function PublicDocsPage() {
  return (
    <div
      style={{
        minHeight: "100%",
        padding: "18px 16px 34px",
        color: "#0b1220",
        fontFamily: "var(--font-sans)",
      }}
    >
      <header>
        <div style={{ color: "#1d4ed8", fontSize: 11, fontWeight: 750, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Salapi · public documentation
        </div>
        <h1 style={{ margin: "7px 0 0", fontSize: 30, lineHeight: 1.08, letterSpacing: "-0.035em" }}>
          Trustless community money pools on Stellar.
        </h1>
        <p style={{ margin: "10px 0 0", color: "#5b6472", fontSize: 14, lineHeight: 1.55 }}>
          A short, checkable guide for users, builders, and reviewers. Salapi is a
          crypto-invisible wallet for savings circles, transfers, and transparent
          disaster relief.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          <span style={{ borderRadius: 999, background: "#fff7ed", color: "#9a3412", padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
            STELLAR TESTNET
          </span>
          <span style={{ borderRadius: 999, background: "#ecfdf5", color: "#047857", padding: "5px 9px", fontSize: 11, fontWeight: 700 }}>
            6 CONTRACT PACKAGES
          </span>
        </div>
      </header>

      <nav
        aria-label="Documentation sections"
        style={{ display: "flex", gap: 12, overflowX: "auto", padding: "18px 0 4px", whiteSpace: "nowrap" }}
      >
        <a href="#overview" style={externalLinkStyle}>Overview</a>
        <a href="#architecture" style={externalLinkStyle}>How it works</a>
        <a href="#contracts" style={externalLinkStyle}>Contracts</a>
        <a href="#evidence" style={externalLinkStyle}>Evidence</a>
        <a href="#status" style={externalLinkStyle}>Status</a>
      </nav>

      <main style={{ display: "grid", gap: 12 }}>
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
            These six contract packages are deployed and verified on Testnet.
            Arisan has separate demo- and long-cadence deployments compiled
            from the same source.
          </p>
          <div style={{ display: "grid", gap: 9 }}>
            {contracts.map((contract) => (
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
          </div>
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
            <li><ExternalLink href="https://salapi.app">Live application</ExternalLink></li>
            <li><ExternalLink href="https://salapi.app/transparency">Live transparency dashboard</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/pull/3">Week 1 Deliverable 1 pull request</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/blob/main/docs/instawards/week-1-d1.md">Week 1 D1 report</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/a670f325bce65a8ec093499cad43699269efddcd5d939a9403ca52eafcff7579">Example 6.50 PHP Testnet contribution</ExternalLink></li>
            <li><ExternalLink href="https://github.com/Ariqhermawan/salapi/blob/main/docs/instawards/week-2-d2.md">Week 2 D2 commit-reveal report</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/f83d24369795458db27a033e921ce84c261840ca29019baaa151dcb1518e50cb">D2 normal round: three reveals</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/1fc95b8cbd2c5a3f54e5b44f0dad88aac55df5af30e5e1c7a0e9fb6ab5a7d0bc">D2 timeout round: one non-revealer</ExternalLink></li>
            <li><ExternalLink href="https://stellar.expert/explorer/testnet/tx/89734260b9a5c1bb099ed65f26a0f815059aea5d6b6fb8aa27f3c7c5c9a256b0">D2 no-reveal liveness fallback</ExternalLink></li>
          </ul>
        </section>

        <section id="status" style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Current status and boundaries</h2>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, color: "#5b6472", fontSize: 13.5, lineHeight: 1.7 }}>
            <li>Live environment: Stellar Testnet only; no real funds and no mainnet deployment.</li>
            <li>Week 1 D1 (exact integer money boundary) is shipped and merged to <code>main</code>.</li>
            <li>Week 2 D2 (participant commit-reveal draw) is implemented and verified on Testnet.</li>
            <li>Disaster-admin controls, independent audit, and fiat anchor integration remain roadmap work.</li>
          </ul>
          <p style={{ margin: "12px 0 0", color: "#5b6472", fontSize: 12.5, lineHeight: 1.5 }}>
            Security assumptions, custody trade-offs, and the mainnet checklist
            are documented in the repository&apos;s
            <ExternalLink href="https://github.com/Ariqhermawan/salapi/blob/main/SECURITY.md"> security policy</ExternalLink>.
          </p>
        </section>
      </main>

      <footer style={{ marginTop: 18, paddingBottom: 8, color: "#7a8494", fontSize: 11.5, lineHeight: 1.5 }}>
        <ExternalLink href="https://github.com/Ariqhermawan/salapi">Source code on GitHub</ExternalLink>
        <span aria-hidden> · </span>
        <Link href="/" style={{ color: "#7a8494" }}>Back to Salapi</Link>
      </footer>
    </div>
  );
}
