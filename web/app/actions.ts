"use server";

import {
  CONTRACTS,
  fmtPeso,
  getNativeBalance,
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
import { getSigner } from "@/lib/server/userWallet";
import { supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function walletState() {
  const { publicKey: address } = await getSigner();
  const bal = await getNativeBalance(address);
  const pesos = stroopsToPesos(bal);
  return { address, pesos, pesoLabel: fmtPeso(pesos) };
}

/** Simulated GCash top-up (labeled sandbox). Real GCash = licensed anchor at
 *  Build Award. On testnet the wallet is Friendbot-funded; this confirms the
 *  flow and refreshes the (real, on-chain) balance. */
export async function topUpSandbox() {
  const { publicKey: address } = await getSigner();
  let funded = false;
  try {
    const r = await fetch(`${FRIENDBOT}/?addr=${address}`, {
      cache: "no-store",
    });
    funded = r.ok;
  } catch {
    /* already funded, expected */
  }
  const bal = await getNativeBalance(address);
  return {
    ok: true,
    funded,
    note: funded
      ? "Sandbox top-up complete (Friendbot-funded)."
      : "Sandbox: in production, GCash → a licensed Stellar anchor credits your wallet. Your testnet balance stands in.",
    pesoLabel: fmtPeso(stroopsToPesos(bal)),
    pesos: stroopsToPesos(bal),
  };
}

/** Simulated GCash withdrawal (labeled sandbox). Real off-ramp = a
 *  licensed Stellar anchor at Build Award. Balance stays real on-chain. */
export async function withdrawSandbox(requested: number) {
  const { publicKey } = await getSigner();
  const bal = await getNativeBalance(publicKey);
  return {
    ok: true as const,
    note:
      "Sandbox: in production, Salapi cashes out to your GCash via a licensed Stellar anchor. On testnet the on-chain balance is unchanged.",
    pesoLabel: fmtPeso(stroopsToPesos(bal)),
    pesos: stroopsToPesos(bal),
    requested,
  };
}

export async function disasterContribute(pesos: number) {
  if (!(pesos > 0)) return { ok: false as const, error: "Enter an amount" };
  const s = await getSigner();
  const r = await invokeAs(s.secret, CONTRACTS.disaster, "contribute", [
    sc.addr(s.publicKey),
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
  const s = await getSigner();
  const r = await invokeAs(s.secret, CONTRACTS.usernameRegistry, "register", [
    sc.addr(s.publicKey),
    sc.str(clean),
  ]);
  return r.ok
    ? { ok: true as const, name: clean, hash: r.hash, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function renameUsername(name: string) {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (clean.length < 3)
    return { ok: false as const, error: "Min 3 chars (a-z, 0-9, _)" };
  const s = await getSigner();
  const r = await invokeAs(s.secret, CONTRACTS.usernameRegistry, "rename", [
    sc.addr(s.publicKey),
    sc.str(clean),
  ]);
  if (r.ok)
    return { ok: true as const, name: clean, hash: r.hash, link: txLink(r.hash) };
  const taken = /taken|#1/i.test(r.error ?? "");
  return {
    ok: false as const,
    error: taken ? `@${clean} is already taken` : r.error || "Couldn't rename",
  };
}

export async function myUsername() {
  try {
    const { publicKey } = await getSigner();
    const u = await readContract(CONTRACTS.usernameRegistry, "username_of", [
      sc.addr(publicKey),
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
  const s = await getSigner();
  const r = await invokeAs(s.secret, CONTRACTS.tokenXlmSac, "transfer", [
    sc.addr(s.publicKey),
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
    const me = (await getSigner()).publicKey;
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
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "contribute", [
    sc.addr(s.publicKey),
  ]);
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
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "payout", []);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

// ── Smart Savings (goal vault) ────────────────────────────────────
// A vault's "mode" rides on the contract's unlock-ledger field. Flexible
// opens with a tiny unlock ledger so the contract permits withdraw at any
// time; Disciplined opens far in the future so the contract only releases
// once the target is reached. MODE_SPLIT sits well above FLEX_UNLOCK and far
// below any realistic testnet ledger, so the stored value classifies cleanly.
const FLEX_UNLOCK = 1;
const LOCKED_UNLOCK = 4_000_000_000;
const MODE_SPLIT = 1_000_000_000;

export async function smartSavingsState() {
  const id = smartSavingsId();
  if (!id) return { ready: false as const };
  try {
    const { publicKey } = await getSigner();
    const g = (await readContract(id, "goal_of", [sc.addr(publicKey)])) as {
      target: number | bigint;
      unlock: number | bigint;
      saved: number | bigint;
    };
    const target = BigInt(g.target);
    const saved = BigInt(g.saved);
    const pct =
      target > 0n ? Math.min(100, Number((saved * 100n) / target)) : 0;
    const reached = saved >= target;
    const mode: "flexible" | "disciplined" =
      Number(g.unlock) < MODE_SPLIT ? "flexible" : "disciplined";
    return {
      ready: true as const,
      hasGoal: true as const,
      targetPeso: fmtPeso(stroopsToPesos(target)),
      savedPeso: fmtPeso(stroopsToPesos(saved)),
      targetPesos: stroopsToPesos(target),
      savedPesos: stroopsToPesos(saved),
      pct,
      mode,
      reached,
      unlocked: reached,
      withdrawable: mode === "flexible" || reached,
    };
  } catch {
    return { ready: true as const, hasGoal: false as const };
  }
}

export async function smartSavingsOpen(
  targetPesos: number,
  mode: "flexible" | "disciplined" = "disciplined"
) {
  const id = smartSavingsId();
  if (!id) return { ok: false as const, error: "Vault not set up" };
  if (!(targetPesos > 0))
    return { ok: false as const, error: "Enter a target amount" };
  const s = await getSigner();
  // Disciplined → far-future unlock (contract releases only at target).
  // Flexible → unlock already passed (contract permits withdraw anytime).
  const r = await invokeAs(s.secret, id, "open_goal", [
    sc.addr(s.publicKey),
    sc.i128(pesosToStroops(targetPesos)),
    sc.u32(mode === "flexible" ? FLEX_UNLOCK : LOCKED_UNLOCK),
  ]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function smartSavingsDeposit(pesos: number) {
  const id = smartSavingsId();
  if (!id) return { ok: false as const, error: "Vault not set up" };
  if (!(pesos > 0)) return { ok: false as const, error: "Enter an amount" };
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "deposit", [
    sc.addr(s.publicKey),
    sc.i128(pesosToStroops(pesos)),
  ]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function smartSavingsWithdraw() {
  const id = smartSavingsId();
  if (!id) return { ok: false as const, error: "Vault not set up" };
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "withdraw", [sc.addr(s.publicKey)]);
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
    const totalPesos = stroopsToPesos(BigInt((total as number) ?? 0));
    return {
      ok: true as const,
      pesoLabel: fmtPeso(totalPesos),
      pesos: totalPesos,
      active: Boolean(active),
    };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "x" };
  }
}

// ── Salapi Circles waitlist (Build-Award preview) ─────────────────────────
// NO on-chain transfer. Persists a pledge to public.circles_waitlist when
// Supabase service-role is configured; otherwise logs to the server console
// and returns ok so the preview UI keeps working in dev / unconfigured envs.
// Schema: web/supabase/circles_waitlist.sql.
export async function joinCirclesWaitlist(input: {
  email: string;
  circleId: string;
  locale: string;
  pesoPledge: number;
  anonymous: boolean;
  marketingOk: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  // Server Functions are reachable via direct POST per Next 16 docs, so any
  // assumption about the shape of `input` must be defended at runtime.
  if (!input || typeof input !== "object")
    return { ok: false, error: "Invalid request." };
  const email = (input.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: "Enter a valid email." };
  if (email.length > 200)
    return { ok: false, error: "Email is too long." };

  const circleId =
    typeof input.circleId === "string" && input.circleId.length <= 120
      ? input.circleId
      : null;
  const locale =
    typeof input.locale === "string" && input.locale.length <= 8
      ? input.locale
      : null;
  const pesoPledge =
    Number.isFinite(input.pesoPledge) && input.pesoPledge >= 0
      ? Math.min(10_000_000, Math.floor(input.pesoPledge))
      : 0;
  const anonymous = Boolean(input.anonymous);
  const marketingOk = Boolean(input.marketingOk);

  // Graceful fallback when Supabase is not configured (local dev without
  // .env.local, or an environment without the service-role key): log it and
  // return ok so the preview flow stays clickable end-to-end.
  if (!supabaseAdminConfigured()) {
    console.log("[circles/waitlist] (preview, no Supabase configured)", {
      email,
      circleId,
      pesoPledge,
      anonymous,
      marketingOk,
      locale,
    });
    return { ok: true };
  }

  try {
    const admin = createSupabaseAdmin();
    const { error } = await admin.from("circles_waitlist").insert({
      email,
      circle_id: circleId,
      peso_pledge: pesoPledge,
      anonymous,
      marketing_ok: marketingOk,
      locale,
    });
    if (error) {
      console.error("[circles/waitlist] insert failed:", error.message);
      return { ok: false, error: "Couldn't save right now. Please try again." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[circles/waitlist] unexpected error:", e);
    return { ok: false, error: "Couldn't save right now. Please try again." };
  }
}
