import Link from "next/link";
import Wallet from "@/components/Wallet";

const ACTIONS = [
  {
    href: "/paluwagan",
    title: "Arisan bareng teman & keluarga",
    desc: "Mau mulai paluwagan anti-kabur? Ayo — kontrak yang pegang pot.",
    cta: "Mulai arisan",
  },
  {
    href: "/transparency",
    title: "Bantu korban bencana",
    desc: "Tiap peso terlacak on-chain. Tanpa politikus, tanpa calo.",
    cta: "Donasi sekarang",
  },
  {
    href: "/send",
    title: "Kirim uang lewat @username",
    desc: "Tanpa alamat panjang. Cukup nama teman.",
    cta: "Kirim uang",
  },
  {
    href: "/savings",
    title: "Nabung dengan tujuan",
    desc: "Kunci uang ke target; cair saat tercapai. Niat nabung jadi nyata.",
    cta: "Mulai nabung",
  },
];

export default function Home() {
  return (
    <div className="pb-8">
      <div className="px-5 pt-5">
        <h1 className="s-h1">Kumusta 👋</h1>
        <p className="s-sub mt-1">
          Nabung, kirim, berbagi — semua dalam peso. Tanpa dompet, tanpa seed
          phrase.
        </p>
      </div>

      <Wallet />

      <section className="mt-8 px-5">
        <h2 className="s-label">Ayo mulai</h2>
        <ul className="mt-3 space-y-2.5">
          {ACTIONS.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="s-card flex items-center gap-3 !p-4 transition-colors hover:border-[var(--color-action)]"
              >
                <div className="flex-1">
                  <div className="font-semibold text-[var(--color-ink)]">
                    {a.title}
                  </div>
                  <div className="mt-0.5 text-sm text-[var(--color-slate)]">
                    {a.desc}
                  </div>
                  <div className="mt-1.5 text-xs font-bold text-[var(--color-action-deep)]">
                    {a.cta} →
                  </div>
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--color-action)" }}
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 px-5 text-[11px] leading-relaxed text-[var(--color-slate)]">
        Stellar PH Ambassador Chapter — Instaward. Demo testnet: saldo &
        transaksi nyata di Stellar testnet (tanpa nilai riil). GCash & sign-in
        adalah sandbox seam; produksi = anchor berlisensi. DAO governance + AI
        Tribunal adalah visi Build-Award, di luar scope ini.
      </p>
    </div>
  );
}
