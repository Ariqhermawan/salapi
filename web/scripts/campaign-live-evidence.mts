// Read-only archive of transactions submitted through salapi.app (never signs).
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Account, Address, BASE_FEE, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { campaignEvidence } from "../lib/campaign-evidence.ts";

const endpoint = "https://soroban-testnet.stellar.org";
const server = new rpc.Server(endpoint);
assert.equal((await server.getNetwork()).passphrase, Networks.TESTNET);
const signerA = "GAKZLTZFGSSM372XUKW2ZIJ5GSHVVIW5BYZIKIXRW2BW4MM6TUI5536Y";
const signerB = "GAVWJIZ45MHV2KWBHNBBB7YHU5CPTIDD3YONC4ZNP7IGE6Z3C777OV4H";
const receipts = [
  [3, "create", "ca04d2161255da36d522df973f23efb882f9eed4ace76ffb5b7e5a15c3e60cd2", signerA],
  [3, "donate_10_0000001_xlm", "1d455a4f5d60d1546f8d8bc595e2b0a02223cde3e865d178c73ca51ba26ea29a", signerA],
  [3, "refund_full", "58bdcea2733db9b79565ceb2b59e38d2b1979f1cb2bdcfd15c303aa57fc3020a", signerA],
  [4, "create", "673d8383c509ca804a1d57fcbf208667b95892ab27d2820bde8a5ab0de22e5d4", signerA],
  [4, "donate_6_50_php_display_1_xlm", "24900f5f21c92f36e2f6885f854f41bf21b6f84d5b890251c8f71a16e82fe27f", signerA],
  [4, "refund_full", "6177ad2f8a1cefc56cc5b4c4a83191929f0866267e2b9ff7697fbf30fd95969c", signerA],
  [5, "create", "f3f5cdbaf9c016f62df94e8b42446cfcdda464085c5fad7861964e6d5fc73dfd", signerB],
  [5, "donate_1_xlm", "c60ae1d33f73f6e9dcc8e98a109a3a73c3e2750717c680593053696bc3472f60", signerB],
  [5, "submit_proof", "2c5632e487d10ff96d7001eca7e5a030c9b8a7d3b164a72266b918c644e1defb", signerB],
  [5, "approve_signer_b", "72b71d719d28caf6b76ed0674c54ef69831b1bee1de3bab025c45fa272d5447a", signerB],
  [5, "approve_signer_a", "6e221463cb600598829b3fbccb1f0044dc7e91547000a6a12a4e3c8fed6a4ba7", signerA],
  [5, "release_0_05_plus_0_95_xlm", "443a9e58e88d2758c7f74a017505c53a759c80e84692a4503037ed0011497a87", signerA],
] as const;
const transactions = await Promise.all(receipts.map(async ([campaignId, label, hash, signer]) => {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: { hash } }) });
  assert(response.ok);
  const rawRpc = await response.json();
  assert.equal(rawRpc.result.status, "SUCCESS");
  const tx = TransactionBuilder.fromXDR(rawRpc.result.envelopeXdr, Networks.TESTNET);
  assert.equal(tx.hash().toString("hex"), hash);
  assert(tx.signatures.some(sig => Keypair.fromPublicKey(signer).verify(tx.hash(), sig.signature())));
  assert.equal(xdr.TransactionResult.fromXDR(rawRpc.result.resultXdr, "base64").result().switch().name, "txSuccess");
  return { campaignId, label, hash, signer, rawRpc };
}));
async function read(method: string, args: xdr.ScVal[]) {
  const tx = new TransactionBuilder(new Account(signerA, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(campaignEvidence.contractId).call(method, ...args)).setTimeout(30).build();
  const result = await server.simulateTransaction(tx);
  assert(!rpc.Api.isSimulationError(result));
  assert(result.result);
  return scValToNative(result.result.retval);
}
const finalStates = await Promise.all([{ id: 3n, donor: signerA }, { id: 4n, donor: signerA }, { id: 5n, donor: signerB }].map(async ({ id, donor }) => {
  const arg = nativeToScVal(id, { type: "u64" });
  const campaign = await read("campaign", [arg]);
  const contribution = await read("contribution", [arg, new Address(donor).toScVal()]);
  assert.equal(campaign.escrow, 0n);
  assert.deepEqual(campaign.state, id === 5n ? ["Released"] : ["Closed"]);
  return { id, donor, campaign, contribution };
}));
writeFileSync(new URL("../../docs/instawards/evidence/week-4-d4-live.json", import.meta.url), JSON.stringify({
  network: "Testnet", contractId: campaignEvidence.contractId, generatedAt: new Date().toISOString(),
  origin: "https://salapi.app", method: "Signed-in production browser transactions; read-only RPC archival",
  custody: "One existing Salapi-managed Testnet account; not independent operators",
  limitation: "Campaign 3 was intended for release but expired without quorum during a pause. Both campaigns exercised full refunds, not browser release.",
  transactions, finalStates,
}, (_, value) => typeof value === "bigint" ? value.toString() : value, 2) + "\n");
console.log("Archived 12 successful live-browser transactions; campaigns 3/4 refunded and campaign 5 released with zero escrow.");
