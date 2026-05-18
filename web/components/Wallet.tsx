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
      <div
        className="mt-4 rounded-2xl p-6 text-white"
        style={{
          background:
            "linear-gradient(150deg,#1d4ed8 0%,#1e3a8a 60%,#0b1220 100%)",
          boxShadow: "0 16px 40px -16px rgba(29,78,216,0.55)",
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-200">
          Available balance
        </div>
        <div className="tabular mt-1.5 text-[2.6rem] font-extrabold leading-none">
          {bal}
        </div>
        <div className="mt-2 text-[11px] text-blue-200/90">
          {addr ? `wallet ${addr.slice(0, 6)}…${addr.slice(-4)} · ` : ""}crypto
          invisible
        </div>
        <button
          onClick={topUp}
          disabled={pending}
          className="mt-5 w-full rounded-xl bg-white py-3 text-sm font-bold text-[var(--color-action-deep)] transition-opacity disabled:opacity-60"
        >
          {pending ? "Processing…" : "Top up with GCash"}
        </button>
      </div>

      {note && (
        <p className="mt-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-[var(--color-warn)]">
          {note}
        </p>
      )}

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Action href="/send" label="Send" d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
        <Action
          href="/vaults"
          label="Vaults"
          d="M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2M3 7h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm9 5v3"
        />
        <Action
          href="/transparency"
          label="Donate"
          d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"
        />
      </div>
    </div>
  );
}

function Action({
  href,
  label,
  d,
}: {
  href: string;
  label: string;
  d: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-xl border border-[var(--color-hairline)] bg-white py-4 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-action)]"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--color-action)" }}
      >
        <path d={d} />
      </svg>
      {label}
    </Link>
  );
}
