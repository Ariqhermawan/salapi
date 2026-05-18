import { Suspense } from "react";
import {
  getDisasterState,
  xlm,
  links,
  CONTRACTS,
  TX_TRAIL,
} from "@/lib/salapi";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Disaster Vault — Public Transparency · Salapi",
  description:
    "Every peso in the Salapi disaster-relief pool, traceable on Stellar.",
};

async function LivePool() {
  const s = await getDisasterState();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat
        label="Pool balance (live on-chain)"
        value={s.ok ? `${xlm(s.totalStroops)} XLM` : "—"}
        sub={s.ok ? `${s.totalStroops.toString()} stroops` : "live read unavailable"}
        accent
      />
      <Stat
        label="Disaster status"
        value={s.ok ? (s.active ? "ACTIVE" : "Standby") : "—"}
        sub={s.ok ? "set on-chain by admin gate" : "see explorer"}
      />
      <Stat
        label="Disbursement gate"
        value="Enforced"
        sub="payout only while a disaster is active"
      />
      {!s.ok && (
        <p className="sm:col-span-3 text-sm text-amber-600">
          Couldn&apos;t reach testnet RPC right now ({s.error}). The contract is
          still live — verify directly on the explorer below.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div
        className={`mt-2 text-2xl font-semibold ${
          accent ? "text-blue-600 dark:text-blue-400" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

export default function TransparencyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-widest text-blue-600">
        Salapi · Public Transparency
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        Disaster Relief Vault
      </h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">
        Every contribution and every disbursement is a public, on-chain
        transaction on Stellar testnet. No login. No middleman. The smart
        contract is the disbursement authority — funds release only while a
        disaster is declared active.
      </p>

      <section className="mt-10">
        <Suspense
          fallback={
            <div className="rounded-xl border border-zinc-200 p-5 text-sm text-zinc-500 dark:border-zinc-800">
              Reading live state from Stellar testnet…
            </div>
          }
        >
          <LivePool />
        </Suspense>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Verifiable transaction trail</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Anyone can independently verify every step on the block explorer.
        </p>
        <ul className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {TX_TRAIL.map((t) => (
            <li
              key={t.hash}
              className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
            >
              <span>{t.step}</span>
              <a
                className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                href={links.tx(t.hash)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.hash.slice(0, 10)}…
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 text-sm text-zinc-500">
        <p>
          Disaster contract:{" "}
          <a
            className="font-mono text-blue-600 hover:underline dark:text-blue-400"
            href={links.contract(CONTRACTS.disaster)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {CONTRACTS.disaster.slice(0, 12)}…
          </a>
        </p>
        <p className="mt-2">
          Testnet stand-in token = native XLM (production = USDC). Contracts are
          asset-agnostic. DAO governance + AI Tribunal are Build-Award vision,
          out of the 30-day scope.
        </p>
      </section>
    </main>
  );
}
