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
  StrKey,
  SorobanDataBuilder,
} from "@stellar/stellar-sdk";
import { bufferedFundingResourceFee, FUNDING_FEE_LIMIT_ERROR, transactionFeeWithinCap, validTransactionFee } from "@/lib/arisan-funding-fees";
import { pesosToStroopsExact } from "@/lib/money";
import { isLocalPreview } from "@/lib/local-preview";
import { getTestnetNativeBalance } from "@/lib/server/walletReadiness";

export const RPC_URL =
  process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const HORIZON = "https://horizon-testnet.stellar.org";
export const FRIENDBOT = "https://friendbot.stellar.org";

// Deployed on testnet, see docs/operations/deployments.md.
export const CONTRACTS = {
  donationCampaign: "CC6D7P35SVCNZLOKTHKDNH4S2ZELYHBP5UO3IWADFORKEF7BCSBY37FU",
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

/** Actual native XLM balance. Provider failures and absent accounts are errors. */
export async function getNativeBalance(pub: string): Promise<bigint> {
  return getTestnetNativeBalance(pub);
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
  pending?: false;
  hash?: string;
} | {
  ok: false;
  error: string;
  pending: true;
  hash: string;
};

function unconfirmedTransaction(hash: string): TxResult {
  return { ok: false, pending: true, hash,
    error: `Transaction status is unknown. Do not resubmit. Check Testnet hash ${hash}.` };
}

function confirmedTransaction(hash: string, result: rpc.Api.GetTransactionResponse): TxResult {
  if (result.status === "SUCCESS")
    return { ok: true, hash, value: result.returnValue != null ? scValToNative(result.returnValue) : null };
  if (result.status === "FAILED")
    return { ok: false, hash, error: `Transaction failed on Testnet. hash=${hash} resultXdr=${result.resultXdr.toXDR("base64").slice(0, 200)}` };
  return unconfirmedTransaction(hash);
}

/** Reconcile one known envelope. This never signs, prepares, or resubmits. */
export async function submittedTransactionStatus(hash: string): Promise<TxResult> {
  if (isLocalPreview) return { ok: false, error: "Local preview cannot query submitted transactions." };
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))
    return { ok: false, error: "Invalid transaction hash" };
  try {
    return confirmedTransaction(hash, await server().getTransaction(hash));
  } catch {
    return unconfirmedTransaction(hash);
  }
}

async function submitAndConfirm(
  srv: rpc.Server,
  transaction: Parameters<rpc.Server["sendTransaction"]>[0],
): Promise<TxResult> {
  // Preserve the signed identity even if the submission response is lost. A
  // fresh transaction is NOT a safe retry of an unknown accepted envelope.
  const hash = transaction.hash().toString("hex");
  try {
    const sent = await srv.sendTransaction(transaction);
    if (sent.status === "ERROR")
      return { ok: false, hash, error: JSON.stringify(sent.errorResult ?? sent) };
    let result = await srv.getTransaction(hash);
    for (let i = 0; i < 30 && result.status === "NOT_FOUND"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      result = await srv.getTransaction(hash);
    }
    return confirmedTransaction(hash, result);
  } catch {
    // The call may have reached the network before failing locally.
    return unconfirmedTransaction(hash);
  }
}

/** Build, sign with the demo signer, submit, and await a testnet tx. */
export async function invoke(
  contractId: string,
  method: string,
  args: xdr.ScVal[] = []
): Promise<TxResult> {
  if (isLocalPreview) return { ok: false, error: "Local preview cannot submit transactions." };
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
    return await submitAndConfirm(srv, prepared);
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

// One server-side source for actions, public state, and the documentation page.
// No legacy fallback: an unset/incorrect D3 deployment must fail closed.
export function disasterId(): string | null {
  const id = process.env.DISASTER_CONTRACT?.trim();
  return id && StrKey.isValidContract(id) ? id : null;
}

// Public, versioned D4 Testnet deployment. An explicit environment override is
// supported, but never falls back when malformed. Every action verifies v4 + SAC.
export function donationCampaignId(): string | null {
  const id = (process.env.DONATION_CAMPAIGN_CONTRACT ?? CONTRACTS.donationCampaign).trim();
  return StrKey.isValidContract(id) ? id : null;
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
  args: xdr.ScVal[] = [],
  options?: { maxFeeStroops: string; bufferRefundableResourceFee?: boolean },
): Promise<TxResult> {
  if (isLocalPreview) return { ok: false, error: "Local preview cannot submit transactions." };
  if (options && (!validTransactionFee(options.maxFeeStroops)
    || (options.bufferRefundableResourceFee !== undefined && typeof options.bufferRefundableResourceFee !== "boolean")))
    return { ok: false, error: "Invalid server transaction fee policy. Nothing was signed or submitted." };
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
    let prepared = await srv.prepareTransaction(built);
    if (options) {
      if (!transactionFeeWithinCap(prepared.fee, options.maxFeeStroops))
        return { ok: false, error: FUNDING_FEE_LIMIT_ERROR };
      if (options.bufferRefundableResourceFee) {
        const data = prepared.toEnvelope().v1().tx().ext().sorobanData();
        const buffered = bufferedFundingResourceFee(data.resourceFee().toString());
        if (!buffered) return { ok: false, error: FUNDING_FEE_LIMIT_ERROR };
        const sorobanData = new SorobanDataBuilder(data).setResourceFee(buffered).build();
        // cloneFrom preserves sequence, operation auth and time bounds. Use
        // inclusion BASE_FEE, not prepared.fee, or resources get counted twice.
        prepared = TransactionBuilder.cloneFrom(prepared, {
          fee: BASE_FEE, sorobanData, networkPassphrase: Networks.TESTNET,
        }).build();
      }
      if (!transactionFeeWithinCap(prepared.fee, options.maxFeeStroops))
        return { ok: false, error: FUNDING_FEE_LIMIT_ERROR };
      prepared.toXDR(); // Validate the entire unsigned envelope before signing.
    }
    prepared.sign(kp);
    return await submitAndConfirm(srv, prepared);
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
  if (isLocalPreview) return { ok: false, error: "Local preview cannot submit transactions." };
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

    return await submitAndConfirm(srv, bump);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
