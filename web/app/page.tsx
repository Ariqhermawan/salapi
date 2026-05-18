import Wallet from "@/components/Wallet";

export default function Home() {
  return (
    <div className="pb-8">
      <div className="px-5 pt-5">
        <h1 className="s-h1">Kumusta 👋</h1>
        <p className="s-sub mt-1">
          Save, send, and give — all in pesos. No wallet, no seed phrase.
        </p>
      </div>

      <Wallet />

      <section className="mt-8 px-5">
        <h2 className="s-label">What you can do</h2>
        <ul className="mt-3 space-y-2.5">
          <Item
            title="Disaster relief, fully transparent"
            desc="Every peso traceable on-chain. No politician, no broker."
          />
          <Item
            title="Paluwagan that can't be stolen"
            desc="A smart contract holds the pot — not a human organiser."
          />
          <Item
            title="Smart savings with a goal"
            desc="Lock money toward a target; withdraw when you reach it."
          />
          <Item
            title="Send by @username"
            desc="No long addresses. Just a name."
          />
        </ul>
      </section>

      <p className="mt-8 px-5 text-[11px] leading-relaxed text-[var(--color-slate)]">
        Stellar PH Ambassador Chapter — Instaward. Testnet demo: balances and
        transactions are real on Stellar testnet (no real value). GCash &
        sign-in are sandbox seams; production = a licensed anchor. DAO
        governance + AI Tribunal are Build-Award vision, out of this scope.
      </p>
    </div>
  );
}

function Item({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="s-card !p-3.5">
      <div className="font-semibold text-[var(--color-ink)]">{title}</div>
      <div className="mt-0.5 text-sm text-[var(--color-slate)]">{desc}</div>
    </li>
  );
}
