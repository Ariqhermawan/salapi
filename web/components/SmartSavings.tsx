"use client";

import { useEffect, useState, useTransition } from "react";
import {
  smartSavingsState,
  smartSavingsOpen,
  smartSavingsDeposit,
  smartSavingsWithdraw,
} from "@/app/actions";

type State = Awaited<ReturnType<typeof smartSavingsState>>;

export default function SmartSavings() {
  const [st, setSt] = useState<State | null>(null);
  const [target, setTarget] = useState("");
  const [dep, setDep] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [pending, start] = useTransition();

  async function refresh() {
    setSt(await smartSavingsState());
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
      setMsg(
        r.ok ? (
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
        ) : (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-700">
            {r.error}
          </div>
        )
      );
      setDep("");
      setTarget("");
      await refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl p-5 text-white"
        style={{
          background:
            "linear-gradient(150deg,#1d4ed8 0%,#1e3a8a 60%,#0b1220 100%)",
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200">
          Smart savings · ipon
        </div>
        <h2 className="mt-1 text-xl font-extrabold leading-snug">
          Punya impian? Nabung pelan-pelan.
        </h2>
        <p className="mt-1.5 text-sm text-blue-100">
          Kunci uang ke target. Tidak bisa diutak-atik sampai tercapai —
          biar niat nabung benar-benar jadi.
        </p>
      </div>

      {st === null ? (
        <p className="s-muted">Memuat…</p>
      ) : !st.ready ? (
        <div className="s-card">
          <p className="text-sm">Vault belum siap. Provisioning…</p>
        </div>
      ) : !st.hasGoal ? (
        <div className="s-card">
          <h3 className="s-label">Mulai tujuan baru</h3>
          <p className="s-muted mt-1">
            Mau nabung berapa? (mis. ₱5,000 buat sekolah anak)
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder="target dalam ₱"
              className="s-input flex-1"
            />
            <button
              className="s-btn !w-auto px-5"
              disabled={pending}
              onClick={() =>
                run(
                  () => smartSavingsOpen(Number(target)),
                  "Tujuan dibuat — ayo mulai setor!"
                )
              }
            >
              {pending ? "…" : "Mulai"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="s-card">
            <div className="flex items-end justify-between">
              <div>
                <h3 className="s-label">Tabungan kamu</h3>
                <div className="tabular mt-1 text-3xl font-extrabold text-[var(--color-ink)]">
                  {st.savedPeso}
                </div>
              </div>
              <div className="text-right">
                <div className="s-muted">target</div>
                <div className="font-semibold text-[var(--color-ink)]">
                  {st.targetPeso}
                </div>
              </div>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-hairline)]">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${st.pct}%`,
                  background:
                    "linear-gradient(90deg,#2563eb,#059669)",
                }}
              />
            </div>
            <div className="s-muted mt-1.5">
              {st.pct}% tercapai{" "}
              {st.unlocked ? "· siap dicairkan 🎉" : "· terkunci sampai target"}
            </div>
          </div>

          <div className="s-card">
            <h3 className="s-label">Setor lagi</h3>
            <div className="mt-3 flex gap-2">
              <input
                value={dep}
                onChange={(e) => setDep(e.target.value)}
                inputMode="decimal"
                placeholder="jumlah dalam ₱"
                className="s-input flex-1"
              />
              <button
                className="s-btn !w-auto px-5"
                disabled={pending}
                onClick={() =>
                  run(
                    () => smartSavingsDeposit(Number(dep)),
                    `Setoran ₱${dep} masuk tabungan`
                  )
                }
              >
                {pending ? "…" : "Setor"}
              </button>
            </div>
          </div>

          <button
            className="s-btn"
            style={{
              background: st.unlocked
                ? "var(--color-money)"
                : "var(--color-hairline)",
              color: st.unlocked ? "#fff" : "var(--color-slate)",
            }}
            disabled={pending || !st.unlocked}
            onClick={() =>
              run(smartSavingsWithdraw, "Tabungan cair — selamat! 🎉")
            }
          >
            {st.unlocked
              ? `Cairkan ${st.savedPeso}`
              : "Cairkan (tunggu target tercapai)"}
          </button>

          {msg && <div className="text-sm">{msg}</div>}
        </>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--color-slate)]">
        Semua aksi = transaksi nyata di Stellar testnet. Uang terkunci di
        smart contract sampai target tercapai — kamu sendiri pun tak bisa
        ambil lebih awal.
      </p>
    </div>
  );
}
