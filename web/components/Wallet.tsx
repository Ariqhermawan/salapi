"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { walletState, topUpSandbox } from "@/app/actions";

export default function Wallet() {
  const [bal, setBal] = useState<string>("…");
  const [addr, setAddr] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [pending, start] = useTransition();

  async function refresh() {
    const s = await walletState();
    setBal(s.pesoLabel);
    setAddr(s.address);
  }
  useEffect(() => {
    refresh();
  }, []);

  function topUp() {
    start(async () => {
      const r = await topUpSandbox();
      setNote(r.note);
      await refresh();
    });
  }

  return (
    <div className="px-5">
      <div className="mt-4 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-900 p-5 text-white shadow-lg">
        <div className="text-xs font-medium uppercase tracking-wide text-blue-200">
          Available balance
        </div>
        <div className="mt-1 text-4xl font-bold">{bal}</div>
        <div className="mt-1 text-[11px] text-blue-200">
          {addr ? `wallet ${addr.slice(0, 6)}…${addr.slice(-4)}` : ""} · crypto
          invisible
        </div>
        <button
          onClick={topUp}
          disabled={pending}
          className="mt-4 w-full rounded-xl bg-white py-3 text-sm font-semibold text-blue-800 disabled:opacity-60"
        >
          {pending ? "Processing…" : "Top up with GCash"}
        </button>
      </div>
      {note && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {note}
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Action href="/send" label="Send" />
        <Action href="/vaults" label="Vaults" />
        <Action href="/transparency" label="Donate" />
      </div>
    </div>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1 rounded-xl border border-zinc-200 py-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
