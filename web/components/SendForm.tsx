"use client";

import { useEffect, useState, useTransition } from "react";
import { registerUsername, myUsername, sendByUsername } from "@/app/actions";

export default function SendForm() {
  const [mine, setMine] = useState<string | null>(null);
  const [claim, setClaim] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [msg, setMsg] = useState<React.ReactNode>("");
  const [pending, start] = useTransition();

  useEffect(() => {
    myUsername().then(setMine);
  }, []);

  function doClaim() {
    start(async () => {
      const r = await registerUsername(claim);
      if (r.ok) {
        setMine(r.name);
        setMsg(<Ok link={r.link}>Claimed @{r.name}</Ok>);
      } else setMsg(<Err>{r.error}</Err>);
    });
  }
  function doSend() {
    start(async () => {
      const r = await sendByUsername(to, Number(amount));
      if (r.ok)
        setMsg(<Ok link={r.link}>Sent ₱{amount} to @{to}</Ok>);
      else setMsg(<Err>{r.error}</Err>);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">Your username</h2>
        {mine ? (
          <p className="mt-2 text-sm">
            You are <span className="font-semibold text-blue-700">@{mine}</span>
          </p>
        ) : (
          <div className="mt-2 flex gap-2">
            <input
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="choose a username"
              className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <button
              onClick={doClaim}
              disabled={pending}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Claim
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 p-4">
        <h2 className="text-sm font-semibold">Send money</h2>
        <div className="mt-2 space-y-2">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="to @username"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="amount in ₱"
            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            onClick={doSend}
            disabled={pending}
            className="w-full rounded-lg bg-blue-700 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </div>
      </section>

      {msg && <div className="text-sm">{msg}</div>}
    </div>
  );
}

function Ok({ children, link }: { children: React.ReactNode; link: string }) {
  return (
    <div className="rounded-lg bg-green-50 px-3 py-2 text-green-700">
      ✓ {children} ·{" "}
      <a
        className="underline"
        href={link}
        target="_blank"
        rel="noopener noreferrer"
      >
        view on-chain
      </a>
    </div>
  );
}
function Err({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
      {children}
    </div>
  );
}
