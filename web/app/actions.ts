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
  arisanRoomsId,
  FRIENDS,
} from "@/lib/server/stellar";
import { getSigner, currentWalletPublicKey } from "@/lib/server/userWallet";
import { supabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// Reject NaN, Infinity, zero, negatives, and absurd magnitudes before they
// reach the stroop conversion / contract i128 args. The upper bound is an
// anti-abuse / anti-overflow guard, not a product limit.
const MAX_AMOUNT = 1_000_000_000;
function badAmount(n: number): boolean {
  return !Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT;
}

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
  if (badAmount(pesos))
    return { ok: false as const, error: "Enter a valid amount" };
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
  if (clean.length > 32)
    return { ok: false as const, error: "Max 32 chars" };
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
  if (clean.length > 32)
    return { ok: false as const, error: "Max 32 chars" };
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

/**
 * The signed-in user's own @handle for display, resolved READ-ONLY (never mints
 * a wallet). Returns null for anonymous/demo visitors and for users with no
 * wallet or no registered username, so the UI falls back to its brand label.
 */
export async function myHandle(): Promise<string | null> {
  try {
    const publicKey = await currentWalletPublicKey();
    if (!publicKey) return null;
    const u = await readContract(CONTRACTS.usernameRegistry, "username_of", [
      sc.addr(publicKey),
    ]);
    return typeof u === "string" && u.length > 0 ? u : null;
  } catch (e) {
    console.error("[myHandle] username lookup failed:", e);
    return null;
  }
}

export async function sendByUsername(name: string, pesos: number) {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (badAmount(pesos))
    return { ok: false as const, error: "Enter a valid amount" };
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
  if (to === s.publicKey)
    return { ok: false as const, error: "Can't send to yourself" };
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
    // readRetry on the critical numeric reads — a transient zero here makes
    // Vaults flash "Rp 0" / "₱0" for the share & pot before settling on the
    // real figure (the same defaulted-read failure mode disasterState already
    // guards). Members must be non-empty and amount must be > 0; both are
    // contract invariants once the circle is initialised.
    const membersRaw = await readRetry(
      id,
      "members",
      (v) => Array.isArray(v) && v.length > 0,
    );
    if (membersRaw == null) {
      return { ready: false as const, error: "paluwagan members degraded" };
    }
    const members = membersRaw as string[];
    const round = Number(await readContract(id, "round")) || 0;
    const amountRaw = await readRetry(
      id,
      "amount",
      (v) => v != null && BigInt(v as number | bigint) > 0n,
    );
    if (amountRaw == null) {
      return { ready: false as const, error: "paluwagan amount degraded" };
    }
    const amount = BigInt(amountRaw as number | bigint);
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
      sharePesos: stroopsToPesos(amount),
      potPesos: stroopsToPesos(amount * BigInt(members.length)),
      // Contract `round` is the absolute, ever-incrementing round; the
      // recipient cycles via `round % len`. The UI shows the 1-based
      // position within the current cycle so it never reads "04 / 03".
      cycleRound: (round % members.length) + 1,
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
  if (badAmount(pesos))
    return { ok: false as const, error: "Enter a valid amount" };
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

// A contract read can be degraded under concurrent RPC load — the Vaults
// screen fires several reads at once, and the disaster total() simulation
// then intermittently reads the contract's storage as absent (the contract
// returns its defaulted 0) or comes back with an empty retval. Retry a few
// times with a short backoff; `accept` decides whether a value is real — for
// the relief pool, which is funded on-chain, a 0 is treated as a degraded
// read, not a genuine zero. After all attempts a rejected value yields null,
// so the caller can show a loading state rather than a false figure.
async function readRetry(
  contractId: string,
  method: string,
  accept: (v: unknown) => boolean = (v) => v != null
): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const v = await readContract(contractId, method);
      if (accept(v)) return v;
    } catch {
      /* transient RPC error — fall through and retry */
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

export async function disasterState() {
  try {
    const [total, active] = await Promise.all([
      readRetry(
        CONTRACTS.disaster,
        "total",
        (v) => v != null && BigInt(v as number | bigint) > 0n
      ),
      readRetry(CONTRACTS.disaster, "is_disaster_active"),
    ]);
    if (total == null) {
      // Every retry read 0/empty — a degraded read, not a confirmed zero.
      // Report not-ok so callers (Vaults, Home, Transparency) show their
      // loading state instead of a false "Rp 0".
      return { ok: false as const, error: "disaster total unavailable" };
    }
    const totalPesos = stroopsToPesos(BigInt(total as number | bigint));
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

// ── Arisan Rooms (roomed prefund circles) ────────────────────────────────
// Mirrors the paluwagan demo flow but built on the multi-room arisan_rooms
// contract: every member locks N × share up front. Each round the draw is a
// two-phase on-chain PRNG — seal_kocok stores a Soroban-PRNG seed for the
// round, then kocok pays unwon[seed % pool.len] — so no caller can choose the
// winner. After N rounds every member has won exactly once and the contract
// balance is 0. Late payment / default / abscond are structurally impossible —
// there is no payment owed after join.

export type ArisanCadence = "Weekly" | "Biweekly" | "Monthly";
export type ArisanStatus = "Open" | "Active" | "Done" | "Dissolved";

// Build-Award preview: cadences run in SECONDS (60/120/300) so a full N=3
// cycle can be observed in a hackathon demo. Production: 7/14/30 days.
const ARISAN_CADENCE_SECS: Record<ArisanCadence, number> = {
  Weekly: 60,
  Biweekly: 120,
  Monthly: 300,
};

function arisanFriendsList() {
  return FRIENDS.filter((f) => f.pub());
}

// 32-char invite-code alphabet: digits 2–9 + uppercase A–Z minus the
// visually-ambiguous O/I/0/1. The same set the contract documents.
const ARISAN_CODE_ALPHA = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** Cryptographically secure 6-char invite code drawn from a CSPRNG.
 *  Node's `crypto.getRandomValues` is the WebCrypto polyfill — same source
 *  as the browser's. We use rejection sampling so each character is uniform
 *  over the 32-char alphabet (no modulo bias). 32^6 ≈ 1B possibilities; the
 *  contract additionally enforces uniqueness on room creation. */
function genArisanCode(): string {
  const out: string[] = [];
  // Map each random byte onto the 32-char alphabet via `& 31` (= % 32). Byte
  // values are 0–255 and 256 is a multiple of 32, so every value maps
  // uniformly onto [0,31] — no modulo bias, no rejection step needed.
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let i = 0;
  while (out.length < 6) {
    if (i >= bytes.length) {
      crypto.getRandomValues(bytes);
      i = 0;
    }
    out.push(ARISAN_CODE_ALPHA[bytes[i++] & 31]);
  }
  return out.join("");
}

function arisanShortAddr(a: string) {
  return a.slice(0, 4) + "…" + a.slice(-4);
}

/** Friendly label for an address (You / Teman A / Teman B / short). */
function arisanLabelOf(addr: string, me: string): string {
  if (addr === me) return "You";
  const fi = FRIENDS.findIndex((f) => f.pub() === addr);
  if (fi >= 0) return FRIENDS[fi].label;
  return arisanShortAddr(addr);
}

/** Soroban contracttype unit-variant enums can deserialize as a tagged object,
 *  a one-element array, or a bare string depending on the SDK build. Coerce. */
function arisanNormalizeStatus(raw: unknown): ArisanStatus {
  if (Array.isArray(raw) && typeof raw[0] === "string")
    return raw[0] as ArisanStatus;
  if (raw && typeof raw === "object" && "tag" in raw)
    return (raw as { tag: ArisanStatus }).tag;
  if (typeof raw === "string") return raw as ArisanStatus;
  return "Open";
}
function arisanNormalizeCadence(raw: unknown): ArisanCadence {
  if (Array.isArray(raw) && typeof raw[0] === "string")
    return raw[0] as ArisanCadence;
  if (raw && typeof raw === "object" && "tag" in raw)
    return (raw as { tag: ArisanCadence }).tag;
  if (typeof raw === "string") return raw as ArisanCadence;
  return "Weekly";
}

async function readArisanRoom(id: string, roomId: number) {
  const r = (await readContract(id, "get_room", [sc.u32(roomId)])) as {
    host: string;
    name: string;
    code: string;
    member_target: number | bigint;
    share: number | bigint;
    cadence: unknown;
    first_kocok: number | bigint;
    join_deadline: number | bigint;
    status: unknown;
    member_count: number | bigint;
    round: number | bigint;
  };
  return {
    host: r.host,
    name: r.name,
    code: r.code,
    memberTarget: Number(r.member_target),
    shareStroops: BigInt(r.share),
    cadence: arisanNormalizeCadence(r.cadence),
    firstKocok: Number(r.first_kocok),
    joinDeadline: Number(r.join_deadline),
    status: arisanNormalizeStatus(r.status),
    memberCount: Number(r.member_count),
    round: Number(r.round),
  };
}

export async function arisanList() {
  const id = arisanRoomsId();
  if (!id) return { ready: false as const };
  try {
    const me = (await getSigner()).publicKey;
    const count = Number(await readContract(id, "room_count")) || 0;
    const limit = Math.min(count, 50); // demo safety cap
    type Row = {
      id: number;
      name: string;
      status: ArisanStatus;
      memberCount: number;
      memberTarget: number;
      sharePeso: string;
      potPeso: string;
      sharePesos: number;
      potPesos: number;
      cadence: ArisanCadence;
      firstKocok: number;
      round: number;
      isMember: boolean;
      isHost: boolean;
      code: string | null;
    };
    const rooms: Row[] = [];
    for (let i = limit; i >= 1; i--) {
      try {
        // Same Rp 0 cold-load guard the disaster/paluwagan reads already have:
        // a transient zero shareStroops would make this room's tile flash
        // "Rp 0" on Vaults. The share is set in create_room and never goes to
        // zero, so a 0 here is a degraded RPC read — retry a few times.
        let r: Awaited<ReturnType<typeof readArisanRoom>> | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          const candidate = await readArisanRoom(id, i);
          if (candidate.shareStroops > 0n) {
            r = candidate;
            break;
          }
          if (attempt < 3) await new Promise((res) => setTimeout(res, 300));
        }
        if (r == null) continue;
        const members =
          ((await readContract(id, "get_members", [sc.u32(i)])) as string[]) ||
          [];
        const isMember = members.includes(me);
        const isHost = r.host === me;
        const pot = r.shareStroops * BigInt(r.memberTarget);
        rooms.push({
          id: i,
          name: r.name,
          status: r.status,
          memberCount: r.memberCount,
          memberTarget: r.memberTarget,
          sharePesos: stroopsToPesos(r.shareStroops),
          potPesos: stroopsToPesos(pot),
          sharePeso: fmtPeso(stroopsToPesos(r.shareStroops)),
          potPeso: fmtPeso(stroopsToPesos(pot)),
          cadence: r.cadence,
          firstKocok: r.firstKocok,
          round: r.round,
          isMember,
          isHost,
          code: isMember ? r.code : null,
        });
      } catch {
        /* gap or read failure — skip */
      }
    }
    // Hide dev-test rooms that were created by automated scripts during
    // verification (verify-arisan.mts seed room, the postpone UI exercise).
    // They live on-chain forever but shouldn't clutter a real user's
    // /arisan list — persona testing flagged them as the loudest "is this
    // demo or real?" signal on first visit.
    const DEV_ROOM_NAMES = new Set(["Postpone test", "Verify · Arisan Rooms"]);
    const mine = rooms
      .filter((r) => !DEV_ROOM_NAMES.has(r.name))
      .filter((r) => r.isMember);
    return { ready: true as const, total: count, mine };
  } catch (e) {
    return {
      ready: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function arisanCreate(input: {
  name: string;
  memberTarget: number;
  sharePesos: number;
  cadence: ArisanCadence;
}) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  if (!input || typeof input !== "object")
    return { ok: false as const, error: "Invalid request" };
  const name = (input.name ?? "").toString().trim().slice(0, 40) || "Arisan";
  const memberTarget = Math.floor(Number(input.memberTarget));
  const sharePesos = Number(input.sharePesos);
  const cadence: ArisanCadence =
    input.cadence === "Biweekly"
      ? "Biweekly"
      : input.cadence === "Monthly"
        ? "Monthly"
        : "Weekly";
  if (!(memberTarget >= 3 && memberTarget <= 20))
    return { ok: false as const, error: "Members must be 3–20" };
  if (badAmount(sharePesos))
    return { ok: false as const, error: "Enter a valid share amount" };

  // Contract requires first_kocok ≥ now + JOIN_WINDOW and
  // join_deadline < first_kocok. In the testnet preview JOIN_WINDOW is 60s,
  // so we schedule first_kocok ~90s out and join_deadline ~30s before that.
  // (Production: JOIN_WINDOW = 3 days, with first_kocok days out.)
  const now = Math.floor(Date.now() / 1000);
  const firstKocok = now + 90;
  const joinDeadline = now + 60;

  // Client-supplied invite code (CSPRNG-derived). The contract checks
  // uniqueness on insert; we pre-flight a few candidates so a 1-in-10^9
  // collision still picks up cleanly on the next try without round-tripping
  // through the contract's InvalidParams error.
  let code = genArisanCode();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const existing = await readContract(id, "room_by_code", [sc.sym(code)]);
      if (existing == null) break; // free
    } catch {
      // room_by_code returns NotFound on miss — that's the case we want.
      break;
    }
    code = genArisanCode();
  }

  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "create_room", [
    sc.addr(s.publicKey),
    sc.sym(code),
    sc.str(name),
    sc.u32(memberTarget),
    sc.i128(pesosToStroops(sharePesos)),
    sc.unitVariant(cadence),
    sc.u64(firstKocok),
    sc.u64(joinDeadline),
  ]);
  if (!r.ok) return { ok: false as const, error: r.error };
  return {
    ok: true as const,
    id: Number(r.value),
    code,
    link: txLink(r.hash),
  };
}

export async function arisanResolveCode(rawCode: string) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  const code = (rawCode ?? "")
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z2-9]/g, "");
  if (code.length !== 6)
    return { ok: false as const, error: "Code must be 6 characters" };
  try {
    const roomId = await readContract(id, "room_by_code", [sc.sym(code)]);
    return { ok: true as const, id: Number(roomId), code };
  } catch {
    return { ok: false as const, error: "Code not found" };
  }
}

export async function arisanJoin(rawCode: string) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  const res = await arisanResolveCode(rawCode);
  if (!res.ok) return res;
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "join_room", [
    sc.u32(res.id),
    sc.sym(res.code),
    sc.addr(s.publicKey),
  ]);
  return r.ok
    ? { ok: true as const, id: res.id, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function arisanLeave(roomId: number) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "leave_room", [
    sc.u32(Number(roomId)),
    sc.addr(s.publicKey),
  ]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function arisanStart(roomId: number) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "start_room", [
    sc.u32(Number(roomId)),
    sc.addr(s.publicKey),
  ]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function arisanCancel(roomId: number) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "cancel_room", [
    sc.u32(Number(roomId)),
    sc.addr(s.publicKey),
  ]);
  return r.ok
    ? { ok: true as const, link: txLink(r.hash) }
    : { ok: false as const, error: r.error };
}

export async function arisanKocok(roomId: number) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  const s = await getSigner();
  const rid = Number(roomId);

  // Two-phase on-chain draw. The contract derives the winner from a sealed
  // Soroban-PRNG seed, so NO caller (not even this server action) can choose
  // who wins:
  //   1. seal_kocok draws + stores the round's seed (one seal per round).
  //   2. kocok reads that seed and pays unwon[seed % poolSize].
  // We tolerate AlreadySealed (#13) so a retry — or another member having
  // already sealed this round — still proceeds straight to the draw.
  const sealed = await invokeAs(s.secret, id, "seal_kocok", [
    sc.u32(rid),
    sc.addr(s.publicKey),
  ]);
  if (!sealed.ok && !/Error\(Contract,\s*#13\)/.test(sealed.error ?? "")) {
    return { ok: false as const, error: sealed.error };
  }

  const r = await invokeAs(s.secret, id, "kocok", [
    sc.u32(rid),
    sc.addr(s.publicKey),
  ]);
  if (!r.ok) return { ok: false as const, error: r.error };
  const winner = typeof r.value === "string" ? r.value : "";
  return {
    ok: true as const,
    winner,
    winnerLabel: arisanLabelOf(winner, s.publicKey),
    link: txLink(r.hash),
  };
}

/** Map raw Soroban contract trap strings to compact i18n keys the UI can
 *  render. The on-chain enum is `Error::{AlreadyInitialized=1, NotInitialized=2,
 *  InvalidParams=3, NotFound=4, WrongStatus=5, NotHost=6, NotMember=7,
 *  AlreadyJoined=8, RoomFull=9, NotYet=10, AlreadyPostponed=11, NotSealed=12,
 *  AlreadySealed=13}` — when simulation fails the SDK surfaces
 *  `Error(Contract, #N)` somewhere in the message. */
function arisanFriendlyError(raw: string | undefined, fallbackKey: string) {
  const s = (raw ?? "").toString();
  const m = s.match(/Error\(Contract,\s*#(\d+)\)/);
  if (!m) return fallbackKey;
  const code = Number(m[1]);
  // Keep this list aligned with contracts/arisan_rooms/src/lib.rs Error.
  const map: Record<number, string> = {
    5: "arisan.somethingWrong", // WrongStatus — generic
    6: "arisan.room.postponeOnlyHost", // NotHost
    7: "arisan.somethingWrong", // NotMember — generic
    11: "arisan.room.alreadyPostponed",
    12: "arisan.somethingWrong", // NotSealed — generic (UI seals before kocok)
    13: "arisan.somethingWrong", // AlreadySealed — tolerated in arisanKocok
  };
  return map[code] ?? fallbackKey;
}

export async function arisanPostpone(roomId: number, delaySeconds: number) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  const delay = Math.max(0, Math.floor(Number(delaySeconds)));
  const s = await getSigner();
  const r = await invokeAs(s.secret, id, "postpone_kocok", [
    sc.u32(Number(roomId)),
    sc.addr(s.publicKey),
    sc.u64(delay),
  ]);
  if (r.ok) return { ok: true as const, link: txLink(r.hash) };
  // Surface a translation key the UI can render instead of the raw XDR /
  // HostError dump. The UI's run() helper falls back to the raw error if
  // errorKey is absent, so older callers stay compatible.
  return {
    ok: false as const,
    error: r.error,
    errorKey: arisanFriendlyError(r.error, "arisan.somethingWrong"),
  };
}

/** Demo helper: have the configured friends auto-join a room by reading its
 *  code from chain. Skips friends already seated. */
export async function arisanFriendsJoin(roomId: number) {
  const id = arisanRoomsId();
  if (!id) return { ok: false as const, error: "Contract not configured" };
  let code: string;
  try {
    const r = await readArisanRoom(id, Number(roomId));
    code = r.code;
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Room not found",
    };
  }
  let joined = 0;
  for (const f of arisanFriendsList()) {
    const lockedRaw = (await readContract(id, "locked_of", [
      sc.u32(Number(roomId)),
      sc.addr(f.pub()),
    ])) as number | bigint | null;
    const locked = lockedRaw == null ? 0n : BigInt(lockedRaw);
    if (locked > 0n) continue;
    const r = await invokeAs(f.secret(), id, "join_room", [
      sc.u32(Number(roomId)),
      sc.sym(code),
      sc.addr(f.pub()),
    ]);
    if (!r.ok) return { ok: false as const, error: `${f.label}: ${r.error}` };
    joined++;
  }
  return { ok: true as const, joined };
}

export async function arisanRoomState(roomId: number) {
  const id = arisanRoomsId();
  if (!id) return { ready: false as const };
  try {
    const me = (await getSigner()).publicKey;
    const rid = Number(roomId);
    const room = await readArisanRoom(id, rid);
    const members =
      ((await readContract(id, "get_members", [sc.u32(rid)])) as string[]) ||
      [];

    const seats = await Promise.all(
      members.map(async (addr) => {
        const won = Boolean(
          await readContract(id, "has_won", [sc.u32(rid), sc.addr(addr)])
        );
        return {
          addr,
          label: arisanLabelOf(addr, me),
          won,
          isYou: addr === me,
        };
      })
    );

    // Rounds are 1-indexed: start_room sets room.round=1 and KocokAt(1)=
    // first_kocok. Each kocok increments room.round, so finished winners live
    // at Winner(1)..Winner(room.round-1). Status flips to Done after the
    // member_count-th kocok, when room.round overshoots by one.
    const winners: Array<{
      round: number;
      addr: string;
      label: string;
      ts: number;
    }> = [];
    for (let r = 1; r < room.round; r++) {
      try {
        const addr = (await readContract(id, "winner_of", [
          sc.u32(rid),
          sc.u32(r),
        ])) as string;
        const ts = Number(
          (await readContract(id, "kocok_at", [sc.u32(rid), sc.u32(r)])) ?? 0
        );
        winners.push({
          round: r,
          addr,
          label: arisanLabelOf(addr, me),
          ts,
        });
      } catch {
        /* ignore — round write may be eventually consistent */
      }
    }

    // Cadence is in seconds for the testnet preview (60/120/300); use it
    // directly here. nextKocok lives at round (1-indexed); Open rooms (round=0
    // pre-start) fall back to firstKocok so the countdown line stays sensible.
    const cadenceSecs = ARISAN_CADENCE_SECS[room.cadence];
    const effectiveRound = Math.max(1, room.round);
    // Read the scheduled kocok time from chain (KocokAt) so a host postpone
    // stays in sync with the "Kocok now" gate. Fall back to the computed
    // cadence schedule only when chain has no value yet (e.g. Open pre-start).
    let nextKocok = 0;
    try {
      nextKocok = Number(
        (await readContract(id, "kocok_at", [sc.u32(rid), sc.u32(effectiveRound)])) ?? 0
      );
    } catch {
      /* round not scheduled on-chain yet; fall back below */
    }
    if (!nextKocok) {
      nextKocok = room.firstKocok + (effectiveRound - 1) * cadenceSecs;
    }
    const pot = room.shareStroops * BigInt(room.memberTarget);
    const isMember = members.includes(me);
    const isHost = room.host === me;
    const seatsFull = seats.length >= room.memberTarget;

    return {
      ready: true as const,
      id: rid,
      name: room.name,
      code: isMember ? room.code : null,
      host: room.host,
      hostLabel: arisanLabelOf(room.host, me),
      cadence: room.cadence,
      cadenceSecs,
      memberTarget: room.memberTarget,
      memberCount: room.memberCount,
      sharePesos: stroopsToPesos(room.shareStroops),
      sharePeso: fmtPeso(stroopsToPesos(room.shareStroops)),
      potPesos: stroopsToPesos(pot),
      potPeso: fmtPeso(stroopsToPesos(pot)),
      status: room.status,
      round: room.round,
      firstKocok: room.firstKocok,
      joinDeadline: room.joinDeadline,
      nextKocok,
      seats,
      winners,
      isMember,
      isHost,
      readyToStart: isHost && room.status === "Open" && seatsFull,
      canKocokNow:
        room.status === "Active" &&
        Date.now() / 1000 >= nextKocok &&
        room.round <= room.memberTarget,
    };
  } catch (e) {
    return {
      ready: false as const,
      error: e instanceof Error ? e.message : String(e),
    };
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
    // Note: deliberately omit `email` (PII) from this preview-fallback log.
    console.log("[circles/waitlist] (preview, no Supabase configured)", {
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
