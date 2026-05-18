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
      if (r.ok) setMsg(<Ok link={r.link}>Sent ₱{amount} to @{to}</Ok>);
      else setMsg(<Err>{r.error}</Err>);
    });
  }

  return (
    <div className="space-y-4">
      <section className="s-card">
        <h2 className="s-label">Your username</h2>
        {mine ? (
          <p className="mt-2 text-[15px] text-[var(--color-ink)]">
            You are{" "}
            <span className="font-bold text-[var(--color-action-deep)]">
              @{mine}
            </span>
          </p>
        ) : (
          <div className="mt-3 flex gap-2">
            <input
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="choose a username"
              className="s-input flex-1"
            />
            <button
              onClick={doClaim}
              disabled={pending}
              className="s-btn !w-auto px-5"
            >
              Claim
            </button>
          </div>
        )}
      </section>

      <section className="s-card">
        <h2 className="s-label">Send money</h2>
        <div className="mt-3 space-y-2.5">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="to @username"
            className="s-input"
          />
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="amount in ₱"
            className="s-input"
          />
          <button onClick={doSend} disabled={pending} className="s-btn">
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
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[var(--color-money)]">
      ✓ {children} ·{" "}
      <a className="s-link" href={link} target="_blank" rel="noopener noreferrer">
        view on-chain
      </a>
    </div>
  );
}
function Err({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-red-700">
      {children}
    </div>
  );
}
