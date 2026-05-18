"use server";

import {
  CONTRACTS,
  demoPublic,
  fmtPeso,
  getNativeBalance,
  invoke,
  pesosToStroops,
  readContract,
  sc,
  stroopsToPesos,
  txLink,
  FRIENDBOT,
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
