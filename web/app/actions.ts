"use server";

import {
  CONTRACTS,
  demoPublic,
  fmtPeso,
  getNativeBalance,
  invoke,
  invokeAs,
  pesosToStroops,
  readContract,
  sc,
  stroopsToPesos,
  txLink,
  FRIENDBOT,
  paluwaganId,
  smartSavingsId,
  FRIENDS,
} from "@/lib/server/stellar";

export async function walletState() {
  const address = demoPublic();
  const bal = await getNativeBalance(address);
  const pesos = stroopsToPesos(bal);
  return { address, pesos, pesoLabel: fmtPeso(pesos) };
}

/** Simulated GCash top-up (labeled sandbox). Real GCash = licensed anchor at
 *  Build Award. On testnet the wallet is Friendbot-funded; this confirms the
 *  flow and refreshes the (real, on-chain) balance. */
export async function topUpSandbox() {
  const address = demoPublic();
  let funded = false;
  try {
    const r = await fetch(`${FRIENDBOT}/?addr=${address}`, {
      cache: "no-store",
    });
    funded = r.ok;
  } catch {
    /* already funded — expected */
  }
  const bal = await getNativeBalance(address);
  return {
    ok: true,
    funded,
    note: funded
      ? "Sandbox top-up complete (Friendbot-funded)."
      : "Sandbox: in production, GCash → a licensed Stellar anchor credits your wallet. Your testnet balance stands in.",
    pesoLabel: fmtPeso(stroopsToPesos(bal)),
  };
}

/** Simulated GCash withdrawal (labeled sandbox). Real off-ramp = a
 *  licensed Stellar anchor at Build Award. Balance stays real on-chain. */
export async function withdrawSandbox(pesos: number) {
  const bal = await getNativeBalance(demoPublic());
  return {
    ok: true as const,
    note:
      "Sandbox: in production, Salapi cashes out to your GCash via a licensed Stellar anchor. On testnet the on-chain balance is unchanged.",
    pesoLabel: fmtPeso(stroopsToPesos(bal)),
    requested: pesos,
  };
}

export async function disasterContribute(pesos: number) {
  if (!(pesos > 0)) return { ok: false as const, error: "Enter an amount" };
  const r = await invoke(CONTRACTS.disaster, "contribute", [
    sc.addr(demoPublic()),
    sc.i128(pesosToStroops(pesos)),
  ]);
  return r.ok
    ? { ok: true as const, hash: r.hash, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function registerUsername(name: string) {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (clean.length < 3)
    return { ok: false as const, error: "Min 3 chars (a-z, 0-9, _)" };
  const r = await invoke(CONTRACTS.usernameRegistry, "register", [
    sc.addr(demoPublic()),
    sc.str(clean),
  ]);
  return r.ok
    ? { ok: true as const, name: clean, hash: r.hash, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function myUsername() {
  try {
    const u = await readContract(CONTRACTS.usernameRegistry, "username_of", [
      sc.addr(demoPublic()),
    ]);
    return typeof u === "string" ? u : null;
  } catch {
    return null;
  }
}

export async function sendByUsername(name: string, pesos: number) {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!(pesos > 0)) return { ok: false as const, error: "Enter an amount" };
  let to: string;
  try {
    const resolved = await readContract(
      CONTRACTS.usernameRegistry,
      "resolve",
      [sc.str(clean)]
    );
    if (typeof resolved !== "string") throw new Error("not found");
    to = resolved;
  } catch {
    return { ok: false as const, error: `@${clean} not found` };
  }
  const r = await invoke(CONTRACTS.tokenXlmSac, "transfer", [
    sc.addr(demoPublic()),
    sc.addr(to),
    sc.i128(pesosToStroops(pesos)),
  ]);
  return r.ok
    ? { ok: true as const, to, hash: r.hash, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

// ── Paluwagan (arisan) ────────────────────────────────────────────
export async function paluwaganState() {
  const id = paluwaganId();
  if (!id) return { ready: false as const };
  try {
    const members = (await readContract(id, "members")) as string[];
    const round = Number(await readContract(id, "round")) || 0;
    const amount = BigInt((await readContract(id, "amount")) as number);
    const recipient = (await readContract(id, "recipient_of", [
      sc.u32(round),
    ])) as string;
    const me = demoPublic();
    const fpub = FRIENDS.map((f) => f.pub());
    const seats = await Promise.all(
      members.map(async (addr, i) => {
        const paid = Boolean(
          await readContract(id, "has_paid", [sc.u32(round), sc.addr(addr)])
        );
        let label = `Member ${i + 1}`;
        if (addr === me) label = "Ikaw (You)";
        else {
          const fi = fpub.indexOf(addr);
          if (fi >= 0) label = FRIENDS[fi].label;
        }
        return { addr, label, paid, isRecipient: addr === recipient };
      })
    );
    const allPaid = seats.every((s) => s.paid);
    return {
      ready: true as const,
      round,
      seats,
      sharePeso: fmtPeso(stroopsToPesos(amount)),
      potPeso: fmtPeso(stroopsToPesos(amount * BigInt(members.length))),
      allPaid,
      recipientLabel:
        seats.find((s) => s.isRecipient)?.label ?? recipient.slice(0, 6),
    };
  } catch (e) {
    return {
      ready: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function paluwaganPayMine() {
  const id = paluwaganId();
  if (!id) return { ok: false as const, error: "Circle not set up" };
  const r = await invoke(id, "contribute", [sc.addr(demoPublic())]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function paluwaganFriendsPay() {
  const id = paluwaganId();
  if (!id) return { ok: false as const, error: "Circle not set up" };
  const round = Number(await readContract(id, "round")) || 0;
  let paid = 0;
  for (const f of FRIENDS) {
    const already = Boolean(
      await readContract(id, "has_paid", [sc.u32(round), sc.addr(f.pub())])
    );
    if (already) continue;
    const r = await invokeAs(f.secret(), id, "contribute", [
      sc.addr(f.pub()),
    ]);
    if (r.ok) paid++;
    else return { ok: false as const, error: `${f.label}: ${r.error}` };
  }
  return { ok: true as const, paid };
}

export async function paluwaganCollect() {
  const id = paluwaganId();
  if (!id) return { ok: false as const, error: "Circle not set up" };
  const r = await invoke(id, "payout", []);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

// ── Smart Savings (goal vault) ────────────────────────────────────
export async function smartSavingsState() {
  const id = smartSavingsId();
  if (!id) return { ready: false as const };
  try {
    const g = (await readContract(id, "goal_of", [
      sc.addr(demoPublic()),
    ])) as { target: number | bigint; saved: number | bigint };
    const target = BigInt(g.target);
    const saved = BigInt(g.saved);
    const pct =
      target > 0n
        ? Math.min(100, Number((saved * 100n) / target))
        : 0;
    return {
      ready: true as const,
      hasGoal: true as const,
      targetPeso: fmtPeso(stroopsToPesos(target)),
      savedPeso: fmtPeso(stroopsToPesos(saved)),
      pct,
      unlocked: saved >= target,
    };
  } catch {
    return { ready: true as const, hasGoal: false as const };
  }
}

export async function smartSavingsOpen(targetPesos: number) {
  const id = smartSavingsId();
  if (!id) return { ok: false as const, error: "Vault not set up" };
  if (!(targetPesos > 0))
    return { ok: false as const, error: "Enter a target amount" };
  const r = await invoke(id, "open_goal", [
    sc.addr(demoPublic()),
    sc.i128(pesosToStroops(targetPesos)),
    sc.u32(4_000_000_000), // far-future ledger → target-driven unlock
  ]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function smartSavingsDeposit(pesos: number) {
  const id = smartSavingsId();
  if (!id) return { ok: false as const, error: "Vault not set up" };
  if (!(pesos > 0)) return { ok: false as const, error: "Enter an amount" };
  const r = await invoke(id, "deposit", [
    sc.addr(demoPublic()),
    sc.i128(pesosToStroops(pesos)),
  ]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function smartSavingsWithdraw() {
  const id = smartSavingsId();
  if (!id) return { ok: false as const, error: "Vault not set up" };
  const r = await invoke(id, "withdraw", [sc.addr(demoPublic())]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function disasterState() {
  try {
    const [total, active] = await Promise.all([
      readContract(CONTRACTS.disaster, "total"),
      readContract(CONTRACTS.disaster, "is_disaster_active"),
    ]);
    return {
      ok: true as const,
      pesoLabel: fmtPeso(stroopsToPesos(BigInt((total as number) ?? 0))),
      active: Boolean(active),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "x" };
  }
}
