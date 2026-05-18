// Server-only Stellar layer. Signs + submits REAL testnet transactions with
// the managed demo signer (testnet, no real value — SOW §13 managed-wallet
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

export const RPC_URL =
  process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const HORIZON = "https://horizon-testnet.stellar.org";
export const FRIENDBOT = "https://friendbot.stellar.org";

// Deployed on testnet — see DEPLOYMENTS.md.
export const CONTRACTS = {
  disaster: "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ",
  usernameRegistry: "CDKYFIAB3WGWAVS4UVZLHIOH7IOP2IYPNBOYVTF677LKUCXPGBO6IQ7V",
  tokenXlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;

// Cosmetic peso framing — testnet XLM has no value (crypto invisible UX).
export const PESO_PER_XLM = 6.5;
const STROOPS = 10_000_000n;

export function pesosToStroops(pesos: number): bigint {
  return BigInt(Math.round((pesos / PESO_PER_XLM) * 1e7));
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
  str: (v: string) => nativeToScVal(v, { type: "string" }),
  bool: (v: boolean) => nativeToScVal(v),
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
    return BigInt(Math.round(parseFloat(native.balance) * 1e7));
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
