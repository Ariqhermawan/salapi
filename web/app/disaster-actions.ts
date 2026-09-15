"use server";

import { nativeToScVal, rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { disasterId, readContract, invokeAs, sc, txLink, stroopsToPesos, fmtPeso, RPC_URL, CONTRACTS } from "@/lib/server/stellar";
import { currentWalletPublicKey, getAuthenticatedSigner, getSigner } from "@/lib/server/userWallet";
import { disasterError, disasterProposalId, parseDisasterAction, requireDisasterMembership } from "@/lib/disaster";
import { moneyInputToStroops, pesosToStroopsExact, type MoneyInput } from "@/lib/money";

type Config = { signers: string[]; token: string; cap_bps: number; timelock_ledgers: number };
type Proposal = { id: bigint; proposer: string; action: ["Disburse", string, bigint] | ["Pause"] | ["Unpause"];
  approvals: string[]; ready_ledger: number | null; executed: boolean; epoch: bigint };
type Status = { balance: bigint; spent_24h: bigint; cap: bigint; allowance: bigint;
  paused: boolean; epoch: bigint; ledger: number; next_id: bigint };

async function deployment() {
  const id = disasterId();
  if (!id) throw new Error("Disaster Vault D3 is awaiting deployment configuration");
  const [version, raw] = await Promise.all([readContract(id, "version"), readContract(id, "config")]);
  const cfg = raw as Config;
  if (version !== 3 || !cfg || !Array.isArray(cfg.signers) || cfg.signers.length !== 3
    || new Set(cfg.signers).size !== 3 || cfg.token !== CONTRACTS.tokenXlmSac
    || cfg.cap_bps !== 2000 || cfg.timelock_ledgers !== 20)
    throw new Error("Configured contract does not match the D3 Testnet controls");
  return { id, cfg };
}

export async function disasterState() {
  try {
    const { id, cfg } = await deployment();
    const state = await readContract(id, "status") as Status;
    if (!state || typeof state.balance !== "bigint" || state.balance < 0n || typeof state.paused !== "boolean")
      throw new Error("Disaster Vault state is unavailable");
    const pesos = stroopsToPesos(state.balance);
    return { ok: true as const, contractId: id, config: cfg, pesos, pesoLabel: fmtPeso(pesos), active: !state.paused,
      status: { ...state, balance: state.balance.toString(), spent_24h: state.spent_24h.toString(),
        cap: state.cap.toString(), allowance: state.allowance.toString(), epoch: state.epoch.toString(), next_id: state.next_id.toString() } };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Disaster Vault is unavailable" };
  }
}

export async function disasterProposals(before = "0") {
  try {
    const cursor = disasterProposalId(before, true);
    const { id } = await deployment();
    const [raw, viewer] = await Promise.all([
      readContract(id, "proposals", [sc.u64(cursor), sc.u32(20)]), currentWalletPublicKey(),
    ]);
    const proposals = (raw as Proposal[]).map(p => ({ id: p.id.toString(), proposer: p.proposer,
      kind: p.action[0], recipient: p.action[0] === "Disburse" ? p.action[1] : null,
      amount: p.action[0] === "Disburse" ? p.action[2].toString() : null,
      approvals: p.approvals, readyLedger: p.ready_ledger ?? null, executed: p.executed, epoch: p.epoch.toString() }));
    return { ok: true as const, proposals, viewer };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Proposals unavailable" };
  }
}

export async function disasterEvents() {
  try {
    const id = disasterId();
    if (!id) throw new Error("D3 deployment is not configured");
    const server = new rpc.Server(RPC_URL);
    const latest = await server.getLatestLedger();
    // A bounded live view, not a permanent index. Long-term proof lives in the D3 report/archive.
    const events = await server.getEvents({ startLedger: Math.max(1, latest.sequence - 720),
      filters: [{ type: "contract", contractIds: [id] }], limit: 100 });
    return { ok: true as const, events: events.events.filter(e => e.inSuccessfulContractCall).reverse().map(e => ({
      id: e.id, ledger: e.ledger, hash: e.txHash, link: txLink(e.txHash), action: String(scValToNative(e.topic[0])),
      time: e.ledgerClosedAt,
    })) };
  } catch {
    return { ok: false as const, error: "Recent event feed is unavailable. Contract/proposal state remains authoritative." };
  }
}

export async function disasterContribute(input: MoneyInput) {
  try {
    const amount = moneyInputToStroops(input);
    if (amount == null || amount <= 0n || amount > pesosToStroopsExact("1000000000")!)
      return { ok: false as const, error: "Enter a valid positive amount" };
    const { id } = await deployment();
    const signer = await getSigner();
    const result = await invokeAs(signer.secret, id, "contribute", [sc.addr(signer.publicKey), sc.i128(amount)]);
    return result.ok ? { ok: true as const, hash: result.hash, link: txLink(result.hash) }
      : { ok: false as const, error: disasterError(result.error) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Contribution failed" };
  }
}

async function privileged(method: "propose" | "approve" | "execute", args: xdr.ScVal[]) {
  try {
    const signer = await getAuthenticatedSigner();
    const { id, cfg } = await deployment();
    requireDisasterMembership(signer.publicKey, cfg.signers, signer.demo);
    const result = await invokeAs(signer.secret, id, method, [sc.addr(signer.publicKey), ...args]);
    return result.ok ? { ok: true as const, hash: result.hash, link: txLink(result.hash) }
      : { ok: false as const, error: disasterError(result.error) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Signer action failed" };
  }
}

export async function disasterPropose(input: unknown) {
  try {
    const action = parseDisasterAction(input);
    const value = xdr.ScVal.scvVec(action[0] === "Disburse"
      ? [sc.sym(action[0]), sc.addr(action[1]), sc.i128(action[2])]
      : [nativeToScVal(action[0], { type: "symbol" })]);
    return await privileged("propose", [value]);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Invalid proposal" };
  }
}

export async function disasterApprove(id: string) {
  try { return await privileged("approve", [sc.u64(disasterProposalId(id))]); }
  catch { return { ok: false as const, error: "Invalid proposal ID" }; }
}

export async function disasterExecute(id: string) {
  try { return await privileged("execute", [sc.u64(disasterProposalId(id))]); }
  catch { return { ok: false as const, error: "Invalid proposal ID" }; }
}
