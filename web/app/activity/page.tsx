import { demoPublic } from "@/lib/server/stellar";
import { TX_TRAIL, links } from "@/lib/salapi";

export const metadata = { title: "Activity · Salapi" };
export const dynamic = "force-dynamic";

export default function ActivityPage() {
  const addr = demoPublic();
  const account = `https://stellar.expert/explorer/testnet/account/${addr}`;
  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">Activity</h1>
      <p className="s-sub mt-1">
        Everything is real & independently verifiable on Stellar testnet.
      </p>

      <a
        href={account}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 block rounded-xl border border-zinc-200 p-4"
      >
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Your wallet (managed demo)
        </div>
        <div className="mt-1 break-all font-mono text-xs">{addr}</div>
        <div className="mt-2 text-sm font-medium text-blue-700">
          Open full account history on explorer →
        </div>
      </a>

      <h2 className="mt-6 text-sm font-semibold">
        Founding on-chain trail (Week 2)
      </h2>
      <ul className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200">
        {TX_TRAIL.map((t) => (
          <li
            key={t.hash}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <span>{t.step}</span>
            <a
              className="font-mono text-blue-700 underline"
              href={links.tx(t.hash)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.hash.slice(0, 8)}…
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
