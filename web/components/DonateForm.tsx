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
          <div className="rounded-lg bg-green-50 px-3 py-2 text-green-700">
            ✓ Donated ₱{amount} ·{" "}
            <a
              className="underline"
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
          <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
            {r.error}
          </div>
        );
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Disaster relief pool</h2>
        <span className="text-xs text-zinc-500">
          {active === null ? "" : active ? "ACTIVE" : "standby"}
        </span>
      </div>
      <div className="mt-1 text-2xl font-bold text-blue-700">{pool}</div>
      <p className="mt-1 text-xs text-zinc-500">
        Every peso traceable on-chain. The contract is the disbursement
        authority.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="amount in ₱"
          className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button
          onClick={donate}
          disabled={pending}
          className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "…" : "Donate"}
        </button>
      </div>
      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  );
}
