"use client";

import { useEffect, useState, useTransition } from "react";
import { disasterContribute, disasterState } from "@/app/actions";

export default function DonateForm() {
  const [pool, setPool] = useState<string>("…");
  const [active, setActive] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [pending, start] = useTransition();

  async function refresh() {
    const s = await disasterState();
    if (s.ok) {
      setPool(s.pesoLabel);
      setActive(s.active);
    }
  }
  useEffect(() => {
    refresh();
  }, []);

  function donate() {
    start(async () => {
      const r = await disasterContribute(Number(amount));
      if (r.ok) {
        setMsg(
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[var(--color-money)]">
            ✓ Donated ₱{amount} ·{" "}
            <a
              className="s-link"
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              view on-chain
            </a>
          </div>
        );
        setAmount("");
        await refresh();
      } else {
        setMsg(
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-700">
            {r.error}
          </div>
        );
      }
    });
  }

  return (
    <div className="s-card">
      <div className="flex items-center justify-between">
        <h2 className="s-label">Disaster relief pool</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={
            active
              ? { background: "#fee2e2", color: "#b91c1c" }
              : { background: "#eef1f6", color: "var(--color-slate)" }
          }
        >
          {active === null ? "…" : active ? "Active" : "Standby"}
        </span>
      </div>
      <div className="tabular mt-1.5 text-3xl font-extrabold text-[var(--color-ink)]">
        {pool}
      </div>
      <p className="s-muted mt-1">
        Every peso traceable on-chain. The contract is the disbursement
        authority.
      </p>
      <div className="mt-4 flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="amount in ₱"
          className="s-input flex-1"
        />
        <button
          onClick={donate}
          disabled={pending}
          className="s-btn !w-auto px-5"
        >
          {pending ? "…" : "Donate"}
        </button>
      </div>
      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  );
}
