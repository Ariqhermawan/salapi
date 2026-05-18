import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col justify-center px-6 py-20">
      <p className="text-sm font-medium uppercase tracking-widest text-blue-600">
        Crypto-invisible fintech · ID × PH
      </p>
      <h1 className="mt-3 text-5xl font-bold tracking-tight sm:text-6xl">
        Salapi<span className="text-blue-600">.</span>
      </h1>
      <p className="mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
        A financial app for the 80M+ non-crypto Filipinos. Sign in, top up with
        GCash, then save, join a paluwagan, donate to disaster relief, or send
        money by username — never seeing or touching crypto. USDC on Stellar is
        invisible plumbing.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/transparency"
          className="rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          View the live Disaster Vault →
        </Link>
        <a
          href="https://github.com/Ariqhermawan/salapi"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-zinc-300 px-6 py-3 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Source & on-chain evidence
        </a>
      </div>

      <div className="mt-12 grid gap-3 text-sm sm:grid-cols-3">
        {[
          ["Disaster Vault", "Transparent public relief pool — live on testnet"],
          ["Paluwagan", "Trustless rotating savings circle — contract holds the pot"],
          ["Smart Savings", "Locked goal vault + P2P send by @username"],
        ].map(([t, d]) => (
          <div
            key={t}
            className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="font-semibold">{t}</div>
            <div className="mt-1 text-zinc-500">{d}</div>
          </div>
        ))}
      </div>

      <p className="mt-12 text-xs text-zinc-500">
        Stellar PH Ambassador Chapter — Instaward. Week 3 (frontend): the public
        transparency dashboard reads live testnet state. Google sign-in + GCash
        sandbox top-up are the next iteration.
      </p>
    </main>
  );
}
