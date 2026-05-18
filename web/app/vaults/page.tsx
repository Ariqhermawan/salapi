import Link from "next/link";
import DonateForm from "@/components/DonateForm";
import { CONTRACTS } from "@/lib/salapi";

const ex = (id: string) =>
  `https://stellar.expert/explorer/testnet/contract/${id}`;

export const metadata = { title: "Vaults · Salapi" };

export default function VaultsPage() {
  return (
    <div className="px-5 py-6">
      <h1 className="s-h1">Vaults</h1>
      <p className="s-sub mt-1 mb-5">
        One primitive, different rules. All live on Stellar testnet.
      </p>

      <DonateForm />

      <Link
        href="/transparency"
        className="mt-3 block text-center text-sm font-medium text-blue-700"
      >
        See the full public transparency dashboard →
      </Link>

      <div className="mt-6 space-y-3">
        <VaultCard
          title="Paluwagan"
          tag="rotating savings circle"
          desc="A smart contract holds the pot and enforces the rotating payout — no organiser can abscond. Contract deployed & unit-tested; interactive UI is the next iteration."
          href={ex("CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ")}
        />
        <VaultCard
          title="Smart Savings"
          tag="locked goal vault"
          desc="Lock money toward a target; withdraw only when you reach it or the unlock date passes. Contract deployed & unit-tested; interactive UI is the next iteration."
          href={ex("CDKYFIAB3WGWAVS4UVZLHIOH7IOP2IYPNBOYVTF677LKUCXPGBO6IQ7V")}
        />
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-zinc-400">
        Disaster contract:{" "}
        <a
          className="underline"
          href={ex(CONTRACTS.disaster)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {CONTRACTS.disaster.slice(0, 12)}…
        </a>
        . DAO governance + AI Tribunal are Build-Award vision, out of scope.
      </p>
    </div>
  );
}

function VaultCard({
  title,
  tag,
  desc,
  href,
}: {
  title: string;
  tag: string;
  desc: string;
  href: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-[11px] uppercase tracking-wide text-zinc-400">
          {tag}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-500">{desc}</p>
      <a
        className="mt-2 inline-block text-xs font-medium text-blue-700 underline"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
      >
        view contract on-chain
      </a>
    </div>
  );
}
