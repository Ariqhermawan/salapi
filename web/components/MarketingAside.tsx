"use client";

// The desktop introduction stays English; app controls retain their locale.
import Link from "next/link";
import Image from "next/image";
import { Wordmark, MakerLockup, PoweredByStellar } from "@/components/ui/kit";

export default function MarketingAside() {
  return (
    <aside className="sl-marketing hidden lg:flex" lang="en">
      <div className="sl-brand">
        <Wordmark size={30} c="#f7f9fd" dot="#78a7ff" />
        <MakerLockup c="#e2e8f0" />
      </div>
      <span className="sl-marketing-badge"><span />Built on Stellar Testnet</span>
      <div>
        <h1>
          Money for everyone.
          <br />
          <span>Technology, invisible.</span>
        </h1>
      </div>
      <div className="sl-marketing-story">
        <p>Community money, with a clearer view of every step.</p>
        <div className="sl-marketing-art"><Image src="/illustrations/giving.png" width="170" height="170" alt="Two people sharing a blue heart" /></div>
        <p>Give with proof, save together, and send by name.</p>
      </div>
      <div className="sl-marketing-links">
        <Link href="/campaigns">Give with clarity <span>↗</span></Link>
        <Link href="/arisan">Save together <span>↗</span></Link>
        <Link href="/send">Send by @ <span>↗</span></Link>
      </div>
      <footer className="sl-marketing-footer">
        <div className="sl-marketing-powered"><PoweredByStellar c="#fff" /></div>
        <Link href="/docs">Public documentation <span aria-hidden="true">↗</span></Link>
        <small>Testnet only. No real-money donations or cash-out.</small>
      </footer>
    </aside>
  );
}
