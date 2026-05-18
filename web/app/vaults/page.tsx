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
        Satu primitive, beda aturan. Semua live di Stellar testnet.
      </p>

      <DonateForm />

      <Link
        href="/transparency"
        className="mt-3 block text-center text-sm font-semibold text-[var(--color-action-deep)]"
      >
        Lihat dashboard transparansi lengkap →
      </Link>

      <Link
        href="/paluwagan"
        className="s-card mt-6 block transition-colors hover:border-[var(--color-action)]"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--color-ink)]">Paluwagan</h3>
          <span className="s-label">arisan anti-kabur</span>
        </div>
        <p className="mt-1 text-sm text-[var(--color-slate)]">
          Mau arisan bareng teman atau keluarga? Smart contract pegang pot,
          rotasi otomatis. Live & interaktif.
        </p>
        <div className="mt-2 text-xs font-bold text-[var(--color-action-deep)]">
          Buka circle →
        </div>
      </Link>

      <div className="s-card mt-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[var(--color-ink)]">
            Smart Savings
          </h3>
          <span className="s-label">goal vault</span>
        </div>
        <p className="mt-1 text-sm text-[var(--color-slate)]">
          Kunci uang ke target; cair saat tercapai atau tanggal buka lewat.
          Kontrak sudah teruji; UI interaktif menyusul.
        </p>
        <a
          className="mt-2 inline-block text-xs font-semibold text-[var(--color-action-deep)] underline"
          href={ex(CONTRACTS.usernameRegistry)}
          target="_blank"
          rel="noopener noreferrer"
        >
          lihat kontrak on-chain
        </a>
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-[var(--color-slate)]">
        Disaster contract:{" "}
        <a
          className="underline"
          href={ex(CONTRACTS.disaster)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {CONTRACTS.disaster.slice(0, 12)}…
        </a>
        . DAO governance + AI Tribunal = visi Build-Award, di luar scope.
      </p>
    </div>
  );
}
