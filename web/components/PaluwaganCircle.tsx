"use client";

import { useEffect, useState, useTransition } from "react";
import {
  paluwaganState,
  paluwaganPayMine,
  paluwaganFriendsPay,
  paluwaganCollect,
} from "@/app/actions";

type State = Awaited<ReturnType<typeof paluwaganState>>;

export default function PaluwaganCircle() {
  const [st, setSt] = useState<State | null>(null);
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [pending, start] = useTransition();

  async function refresh() {
    setSt(await paluwaganState());
  }
  useEffect(() => {
    refresh();
  }, []);

  function run(
    fn: () => Promise<{ ok: boolean; link?: string; error?: string }>,
    okText: string
  ) {
    start(async () => {
      setMsg("");
      const r = await fn();
      if (r.ok)
        setMsg(
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[var(--color-money)]">
            ✓ {okText}
            {r.link && (
              <>
                {" · "}
                <a
                  className="s-link"
                  href={r.link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  view on-chain
                </a>
              </>
            )}
          </div>
        );
      else
        setMsg(
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-700">
            {r.error}
          </div>
        );
      await refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Invitation */}
      <div
        className="rounded-2xl p-5 text-white"
        style={{
          background:
            "linear-gradient(150deg,#1d4ed8 0%,#1e3a8a 60%,#0b1220 100%)",
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200">
          Arisan · anti-kabur
        </div>
        <h2 className="mt-1 text-xl font-extrabold leading-snug">
          Mau arisan bareng teman atau keluarga?
        </h2>
        <p className="mt-1.5 text-sm text-blue-100">
          Ayo mulai — uang dipegang smart contract, bukan pengurus. Tiap
          giliran cair otomatis. Tidak ada yang bisa kabur bawa pot.
        </p>
      </div>

      {st === null ? (
        <p className="s-muted">Memuat circle…</p>
      ) : !st.ready ? (
        <div className="s-card">
          <p className="text-sm text-[var(--color-ink)]">
            Circle demo belum siap.{" "}
            <span className="s-muted">
              {("error" in st && st.error) || "Provisioning…"}
            </span>
          </p>
        </div>
      ) : (
        <>
          <div className="s-card">
            <div className="flex items-center justify-between">
              <h3 className="s-label">Circle kamu · Ronde #{st.round + 1}</h3>
              <span className="s-muted">
                {st.sharePeso}/ronde · pot {st.potPeso}
              </span>
            </div>

            <ul className="mt-3 space-y-2">
              {st.seats.map((s) => (
                <li
                  key={s.addr}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-hairline)] px-3 py-2.5"
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{
                      background: s.isRecipient
                        ? "var(--color-money)"
                        : "var(--color-action)",
                    }}
                  >
                    {s.label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="flex-1 text-sm font-medium text-[var(--color-ink)]">
                    {s.label}
                    {s.isRecipient && (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--color-money)]">
                        Giliran cair
                      </span>
                    )}
                  </span>
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color: s.paid
                        ? "var(--color-money)"
                        : "var(--color-slate)",
                    }}
                  >
                    {s.paid ? "✓ Sudah bayar" : "Belum"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2.5">
            <button
              className="s-btn"
              disabled={pending}
              onClick={() =>
                run(paluwaganPayMine, "Setoran kamu masuk circle")
              }
            >
              {pending ? "…" : `Bayar bagianku (${st.sharePeso})`}
            </button>
            <button
              className="s-btn-ghost w-full"
              disabled={pending}
              onClick={() =>
                run(paluwaganFriendsPay, "Teman A & B ikut menyetor (demo)")
              }
            >
              Teman ikut bayar — demo
            </button>
            <button
              className="s-btn"
              style={{
                background: st.allPaid
                  ? "var(--color-money)"
                  : "var(--color-hairline)",
                color: st.allPaid ? "#fff" : "var(--color-slate)",
              }}
              disabled={pending || !st.allPaid}
              onClick={() =>
                run(
                  paluwaganCollect,
                  `Pot ${st.potPeso} cair ke ${st.recipientLabel}`
                )
              }
            >
              {st.allPaid
                ? `Cairkan pot ${st.potPeso} → ${st.recipientLabel}`
                : "Cairkan (tunggu semua bayar)"}
            </button>
          </div>

          {msg && <div className="text-sm">{msg}</div>}
          <p className="text-[11px] leading-relaxed text-[var(--color-slate)]">
            Semua aksi = transaksi nyata di Stellar testnet. &quot;Teman&quot;
            adalah dompet demo yang dikelola server (berlabel) supaya rotasi
            bisa kamu lihat utuh; di produksi tiap anggota tanda tangan sendiri.
          </p>
        </>
      )}
    </div>
  );
}
