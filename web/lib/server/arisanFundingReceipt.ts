import "server-only";

import { Address, FeeBumpTransaction, Networks, Transaction, TransactionBuilder, rpc, scValToNative, StrKey } from "@stellar/stellar-sdk";
import { MAX_FUNDING_SHARE_STROOPS, type FundingCadence } from "@/lib/arisan-funding";
import { RPC_URL } from "@/lib/server/stellar";

export type FundingCreateReceipt = {
  host: string;
  code: string;
  name: string;
  memberTarget: number;
  shareStroops: string;
  cadence: FundingCadence;
  fundingDeadline: number;
};

/** Query only the original envelope. No preparation, custody access or send. */
export async function readArisanFundingReceipt(hash: string): Promise<rpc.Api.GetTransactionResponse | null> {
  if (typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) return null;
  try { return await new rpc.Server(RPC_URL, { timeout: 15000 }).getTransaction(hash); }
  catch { return null; }
}

/** This is only a receipt decoder. The action independently checks current
 * candidate capability, verified ownership, and the room's immutable terms.
 */
export function verifyArisanFundingCreateReceipt(response: rpc.Api.GetTransactionResponse | null,
  hash: string, contractId: string, wallet: string): FundingCreateReceipt | null {
  try {
    if (!response || response.status !== "SUCCESS" || response.txHash !== hash
      || !/^[a-f0-9]{64}$/.test(hash) || !StrKey.isValidContract(contractId)
      || !StrKey.isValidEd25519PublicKey(wallet) || !Number.isSafeInteger(response.ledger)
      || response.ledger <= 0 || response.ledger > 0xffff_ffff) return null;
    const outer = TransactionBuilder.fromXDR(response.envelopeXdr.toXDR("base64"), Networks.TESTNET);
    if (outer.hash().toString("hex") !== hash || response.feeBump !== (outer instanceof FeeBumpTransaction)) return null;
    const tx = outer instanceof FeeBumpTransaction ? outer.innerTransaction : outer;
    if (!(tx instanceof Transaction) || tx.source !== wallet || tx.operations.length !== 1) return null;
    const result = response.resultXdr.result();
    if (outer instanceof FeeBumpTransaction) {
      if (result.switch().name !== "txFeeBumpInnerSuccess"
        || result.innerResultPair().result().result().switch().name !== "txSuccess"
        || !Buffer.from(result.innerResultPair().transactionHash() as unknown as Uint8Array).equals(tx.hash())) return null;
    } else if (result.switch().name !== "txSuccess") return null;
    const execution = outer instanceof FeeBumpTransaction ? result.innerResultPair().result().result() : result;
    const operationResults = execution.results();
    if (operationResults.length !== 1 || operationResults[0].switch().name !== "opInner"
      || operationResults[0].tr().switch().name !== "invokeHostFunction"
      || operationResults[0].tr().invokeHostFunctionResult().switch().name !== "invokeHostFunctionSuccess") return null;
    const operation = tx.operations[0];
    if (operation.type !== "invokeHostFunction" || (operation.source && operation.source !== wallet)
      || operation.func.switch().name !== "hostFunctionTypeInvokeContract") return null;
    const invocation = operation.func.invokeContract();
    if (Address.fromScAddress(invocation.contractAddress()).toString() !== contractId
      || invocation.functionName().toString() !== "create_installment_room") return null;
    const args = invocation.args();
    const expectedTypes = ["scvAddress", "scvSymbol", "scvString", "scvU32", "scvI128", "scvVec", "scvU64"];
    if (args.length !== expectedTypes.length || args.some((arg, index) => arg.switch().name !== expectedTypes[index])) return null;
    if (Address.fromScVal(args[0]).toString() !== wallet) return null;
    const code = scValToNative(args[1]), name = scValToNative(args[2]), memberTarget = scValToNative(args[3]);
    const share = scValToNative(args[4]), rawCadence = args[5].vec(), deadline = scValToNative(args[6]);
    if (typeof code !== "string" || !/^[A-HJ-NP-Z2-9]{6}$/.test(code) || typeof name !== "string"
      || !name.trim() || Buffer.byteLength(name, "utf8") > 80 || typeof memberTarget !== "number"
      || !Number.isInteger(memberTarget) || memberTarget < 3 || memberTarget > 20
      || typeof share !== "bigint" || share <= 0n || share > BigInt(MAX_FUNDING_SHARE_STROOPS)
      || !rawCadence || rawCadence.length !== 1 || rawCadence[0].switch().name !== "scvSymbol"
      || typeof deadline !== "bigint" || deadline <= 0n || deadline > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    const cadence = scValToNative(rawCadence[0]);
    if (cadence !== "Weekly" && cadence !== "Biweekly" && cadence !== "Monthly") return null;
    return { host: wallet, code, name, memberTarget, shareStroops: share.toString(), cadence,
      fundingDeadline: Number(deadline) };
  } catch { return null; }
}
