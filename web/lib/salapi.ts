// Server-side helpers for reading Salapi's LIVE state from Stellar testnet.
// No secrets, no signing, read-only contract simulation over public RPC.

import {
  rpc,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Account,
  scValToNative,
} from "@stellar/stellar-sdk";

export const TESTNET_RPC = "https://soroban-testnet.stellar.org";

// Deployed on Stellar testnet, see DEPLOYMENTS.md (canonical).
export const CONTRACTS = {
  disaster: "CCKQ3UVBZ75KSZDO6IPA5U6PFARJG4PLRGN2SAIW5RAGQ6K4B7ZDWBUZ",
  baseVault: "CBC6BTKW5VA6Y2XH6WP4IEPWDZ7TBPYSIIOZQMTEH62N62NFT4F4VYDD",
  usernameRegistry: "CDKYFIAB3WGWAVS4UVZLHIOH7IOP2IYPNBOYVTF677LKUCXPGBO6IQ7V",
  tokenXlmSac: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
} as const;

// Any account works as the simulation source (no auth, no funds needed).
const SIM_SOURCE = "GC2P5KXDI74CGDIB3GR7IULRLHZCC4U4JCCYASXVCMVWUMUBWZNBTBNP";

const explorer = "https://stellar.expert/explorer/testnet";
export const links = {
  contract: (id: string) => `${explorer}/contract/${id}`,
  tx: (h: string) => `${explorer}/tx/${h}`,
};

// The verifiable Week-2 transaction trail (from DEPLOYMENTS.md).
export const TX_TRAIL = [
  { step: "Deploy disaster vault", hash: "1bed6a16e6b6b2a8fddf3c8e247764f77f80bc18f58cd019bec225e60d891d12" },
  { step: "register @juandelacruz", hash: "00d0861463b124d7ec83b1cb5ef65f4b13579167127b8acede5c01362f8bf913" },
  { step: "initialize(admin, token)", hash: "f49b815b47b052ba12f288c64c1e11e336b9a6a1afaf5d359db08b928e20beb1" },
  { step: "contribute 5 XLM", hash: "618dedd72dd1ba49f7432dc33e237007da5280c857d00e4eff6164247ad0cd66" },
  { step: "set_disaster(true)", hash: "7ecdeaf152745257b1d0f619503f6f59971068ad1a3bf7dd8499a08295608d0a" },
  { step: "disburse 2 XLM", hash: "1115f685287faf7b508e97d378df5f4ccb1ccc302d007b2190776ad0c986a837" },
] as const;

export type DisasterState =
  | { ok: true; totalStroops: bigint; active: boolean }
  | { ok: false; error: string };

async function readMethod(method: string) {
  const server = new rpc.Server(TESTNET_RPC);
  const contract = new Contract(CONTRACTS.disaster);
  const source = new Account(SIM_SOURCE, "0");
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result
    ?.retval;
  if (!retval) throw new Error(`empty result for ${method}`);
  return scValToNative(retval);
}

/** Reads the live disaster pool from Stellar testnet at request time. */
export async function getDisasterState(): Promise<DisasterState> {
  try {
    const [total, active] = await Promise.all([
      readMethod("total"),
      readMethod("is_disaster_active"),
    ]);
    return {
      ok: true,
      totalStroops: BigInt(total ?? 0),
      active: Boolean(active),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Native XLM has 7 decimals. */
export function xlm(stroops: bigint): string {
  const neg = stroops < 0n;
  const s = (neg ? -stroops : stroops).toString().padStart(8, "0");
  const whole = s.slice(0, -7);
  const frac = s.slice(-7).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}
