// Server-only Stellar layer. Signs + submits REAL testnet transactions with
// the managed demo signer (testnet, no real value, SOW §13 managed-wallet
// model). Never import from a Client Component.

import {
  rpc,
  Keypair,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
  Account,
  xdr,
} from "@stellar/stellar-sdk";
import {
  nativeBalanceToStroops,
  pesosToStroopsExact,
} from "@/lib/money";

export const RPC_URL =
  process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const HORIZON = "https://horizon-testnet.stellar.org";
export const FRIENDBOT = "https://friendbot.stellar.org";

// Deployed on testnet, see docs/operations/deployments.md.
export const CONTRACTS = {
  disaster: "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ",
  usernameRegistry: "CDDINUQXTF6SHZN2ZJ36IT7P4YOJ3OZN3H6LTYHVCQ35YYO7YTAWM4G3",
  tokenXlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;

// Cosmetic peso framing, testnet XLM has no value (crypto invisible UX).
export const PESO_PER_XLM = 6.5;

/** Backwards-compatible PHP boundary; callers should pass a decimal string. */
export function pesosToStroops(pesos: string): bigint {
  const stroops = pesosToStroopsExact(pesos);
  if (stroops == null) throw new Error("Invalid peso amount");
  return stroops;
}
export function stroopsToPesos(stroops: bigint): number {
  return (Number(stroops) / 1e7) * PESO_PER_XLM;
}
export function fmtPeso(pesos: number): string {
  return "₱" + pesos.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

function server() {
  return new rpc.Server(RPC_URL);
}

export function demoKeypair(): Keypair {
  const s = process.env.SALAPI_DEMO_SECRET;
  if (!s) throw new Error("SALAPI_DEMO_SECRET missing (.env.local)");
  return Keypair.fromSecret(s);
}
export function demoPublic(): string {
  return process.env.SALAPI_DEMO_PUBLIC ?? demoKeypair().publicKey();
}

export const sc = {
  addr: (a: string) => new Address(a).toScVal(),
  i128: (v: bigint) => nativeToScVal(v, { type: "i128" }),
  u32: (v: number) => nativeToScVal(v, { type: "u32" }),
  u64: (v: bigint | number) => nativeToScVal(BigInt(v), { type: "u64" }),
  str: (v: string) => nativeToScVal(v, { type: "string" }),
  sym: (s: string) => nativeToScVal(s, { type: "symbol" }),
  bytes: (v: Uint8Array) => xdr.ScVal.scvBytes(Buffer.from(v)),
  bool: (v: boolean) => nativeToScVal(v),
  // Unit variant of a Soroban contract enum (e.g. Cadence::Weekly).
  // Encoded as a vec containing a single symbol = variant name.
  unitVariant: (variant: string) =>
    xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)]),
};

/** Native XLM balance of an account, via Horizon (simple + reliable). */
export async function getNativeBalance(pub: string): Promise<bigint> {
  try {
    const r = await fetch(`${HORIZON}/accounts/${pub}`, {
      cache: "no-store",
    });
    if (!r.ok) return 0n;
    const j = await r.json();
    const native = (j.balances ?? []).find(
      (b: { asset_type: string }) => b.asset_type === "native"
    );
    if (!native) return 0n;
    return nativeBalanceToStroops(native.balance) ?? 0n;
  } catch {
    return 0n;
  }
}

/** Read-only contract call (simulation, no submit, no signing). */
export async function readContract(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<unknown> {
  const srv = server();
  const acct = new Account(demoPublic(), "0");
  const tx = new TransactionBuilder(acct, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await srv.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  const ret = (sim as rpc.Api.SimulateTransactionSuccessResponse).result
    ?.retval;
  return ret ? scValToNative(ret) : null;
}

export type TxResult = { ok: true; hash: string; value: unknown } | {
  ok: false;
  error: string;
};

/** Build, sign with the demo signer, submit, and await a testnet tx. */
export async function invoke(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<TxResult> {
  try {
    const srv = server();
    const kp = demoKeypair();
    const source = await srv.getAccount(kp.publicKey());
    const built = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();

    const prepared = await srv.prepareTransaction(built);
    prepared.sign(kp);
    const sent = await srv.sendTransaction(prepared);
    if (sent.status === "ERROR") {
      return { ok: false, error: JSON.stringify(sent.errorResult ?? sent) };
    }
    // poll
    let gt = await srv.getTransaction(sent.hash);
    for (let i = 0; i < 30 && gt.status === "NOT_FOUND"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      gt = await srv.getTransaction(sent.hash);
    }
    if (gt.status === "SUCCESS") {
      return {
        ok: true,
        hash: sent.hash,
        value:
          gt.returnValue != null ? scValToNative(gt.returnValue) : null,
      };
    }
    return { ok: false, error: `tx ${gt.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const txLink = (h: string) =>
  `https://stellar.expert/explorer/testnet/tx/${h}`;

// ── Paluwagan demo circle (provisioned by scripts/wsl-paluwagan-setup.sh) ──
export function paluwaganId(): string | null {
  return process.env.PALUWAGAN_CONTRACT ?? null;
}
export function smartSavingsId(): string | null {
  return process.env.SMARTSAVINGS_CONTRACT ?? null;
}
export function arisanRoomsId(): string | null {
  return process.env.ARISAN_ROOMS_CONTRACT ?? null;
}
export const FRIENDS = [
  {
    label: "Teman A",
    pub: () => process.env.FRIEND1_PUBLIC ?? "",
    secret: () => process.env.FRIEND1_SECRET ?? "",
  },
  {
    label: "Teman B",
    pub: () => process.env.FRIEND2_PUBLIC ?? "",
    secret: () => process.env.FRIEND2_SECRET ?? "",
  },
];

/** Like invoke(), but signed by an arbitrary secret (used for demo friends). */
export async function invokeAs(
  secret: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<TxResult> {
  try {
    const srv = server();
    const kp = Keypair.fromSecret(secret);
    const source = await srv.getAccount(kp.publicKey());
    const built = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();
    const prepared = await srv.prepareTransaction(built);
    prepared.sign(kp);
    const sent = await srv.sendTransaction(prepared);
    if (sent.status === "ERROR")
      return { ok: false, error: JSON.stringify(sent.errorResult ?? sent) };
    let gt = await srv.getTransaction(sent.hash);
    for (let i = 0; i < 30 && gt.status === "NOT_FOUND"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      gt = await srv.getTransaction(sent.hash);
    }
    if (gt.status === "SUCCESS")
      return {
        ok: true,
        hash: sent.hash,
        value: gt.returnValue != null ? scValToNative(gt.returnValue) : null,
      };
    // tx executed and failed — surface enough for the caller to diagnose.
    type FailMeta = {
      resultXdr?: { toXDR?: (fmt: string) => string };
      resultMetaXdr?: { toXDR?: (fmt: string) => string };
    };
    const meta = gt as unknown as FailMeta;
    const xdr1 = meta.resultXdr?.toXDR?.("base64") ?? "";
    const xdr2 = meta.resultMetaXdr?.toXDR?.("base64") ?? "";
    return {
      ok: false,
      error: `tx ${gt.status} hash=${sent.hash} resultXdr=${xdr1.slice(0, 200)}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Fee sponsorship (gasless via fee-bump, CAP-0015) ──────────────────────────
// L6 advanced feature. A dedicated sponsor account pays the network fee so the
// user's wallet pays nothing — gas disappears from the user account entirely,
// deepening the crypto-invisible model. Opt-in: with no SALAPI_SPONSOR_SECRET
// set, invokeSponsored() falls back to the normal user-paid invokeAs() (logged,
// never silent), so current production behavior is unchanged until a sponsor is
// provisioned + Friendbot-funded. See rise-in/L6-ADVANCED-FEATURE-DESIGN.md.

function sponsorKeypair(): Keypair | null {
  const s = process.env.SALAPI_SPONSOR_SECRET;
  return s ? Keypair.fromSecret(s) : null;
}

/** Public key of the fee sponsor, or null when sponsorship is not configured. */
export function sponsorPublic(): string | null {
  const sk = sponsorKeypair();
  if (sk) return sk.publicKey();
  return process.env.SALAPI_SPONSOR_PUBLIC ?? null;
}

/** Sponsor gas-budget health: its native XLM balance, or null when unconfigured. */
export async function sponsorBalance(): Promise<bigint | null> {
  const pub = sponsorPublic();
  return pub ? getNativeBalance(pub) : null;
}

/**
 * Like invokeAs(), but the network fee is paid by the sponsor via a fee-bump:
 * the USER stays the operation source (contract require_auth() still passes on
 * the user, on-chain attribution unchanged) while the SPONSOR pays the fee. The
 * user can hold zero XLM and still transact — the textbook gasless UX.
 *
 * Ordering matters: prepare + user-sign the inner tx FIRST (prepareTransaction
 * mutates Soroban fees/footprint), THEN wrap it in the fee-bump, THEN
 * sponsor-sign the outer envelope.
 */
export async function invokeSponsored(
  userSecret: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<TxResult> {
  const sk = sponsorKeypair();
  if (!sk) {
    console.warn(
      "[invokeSponsored] SALAPI_SPONSOR_SECRET not set; using user-paid invokeAs()"
    );
    return invokeAs(userSecret, contractId, method, args);
  }
  try {
    const srv = server();
    const userKp = Keypair.fromSecret(userSecret);
    const source = await srv.getAccount(userKp.publicKey());
    const inner = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();
    const prepared = await srv.prepareTransaction(inner); // Soroban prep on inner
    prepared.sign(userKp); // user signs the inner envelope

    // Wrap as a fee-bump: the sponsor pays. The outer fee must cover the inner
    // (Soroban resource) fee; over-paying on testnet is harmless (sponsor pays).
    const outerFee = (BigInt(prepared.fee) * 2n).toString();
    const bump = TransactionBuilder.buildFeeBumpTransaction(
      sk,
      outerFee,
      prepared,
      Networks.TESTNET
    );
    bump.sign(sk); // sponsor signs the outer envelope

    const sent = await srv.sendTransaction(bump);
    if (sent.status === "ERROR")
      return { ok: false, error: JSON.stringify(sent.errorResult ?? sent) };
    let gt = await srv.getTransaction(sent.hash);
    for (let i = 0; i < 30 && gt.status === "NOT_FOUND"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      gt = await srv.getTransaction(sent.hash);
    }
    if (gt.status === "SUCCESS")
      return {
        ok: true,
        hash: sent.hash,
        value: gt.returnValue != null ? scValToNative(gt.returnValue) : null,
      };
    return { ok: false, error: `tx ${gt.status} hash=${sent.hash}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
