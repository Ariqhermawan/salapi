import "server-only";
import { Account, Address, BASE_FEE, Contract, FeeBumpTransaction, nativeToScVal, Networks, rpc, scValToNative, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { arisanRoomsId, CONTRACTS, disasterId, donationCampaignId, paluwaganId, smartSavingsId, RPC_URL } from "./stellar";
import { readCircleDiscoveryMappings } from "./circlesTestnet";
import { validatedCircleTestnetCampaign } from "../circles/testnet";
import { SEED_CIRCLES } from "../circles/seed";
import type { WalletActivityContext, WalletActivityItem } from "../wallet-activity";

type Deployments = { campaign: string | null; arisan: string | null; disaster: string | null; paluwagan: string | null; savings: string | null };
const deployments = (): Deployments => ({ campaign: donationCampaignId(), arisan: arisanRoomsId(), disaster: disasterId(), paluwagan: paluwaganId(), savings: smartSavingsId() });
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const title = (value: unknown): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;

/** Do not classify by an address alone: refunds and payouts share contracts.
 * Joined Horizon evidence is already read from the fixed Testnet provider. A
 * missing/mismatched envelope leaves the original confirmed movement intact. */
export function activityContextFromRecord(item: WalletActivityItem, record: unknown, viewer: string, configured: Deployments = deployments()): WalletActivityContext | undefined {
  try {
    if (item.kind !== "soroban-transfer" || item.asset.code !== "XLM" || !object(record) || record.transaction_successful !== true
      || record.transaction_hash !== item.hash || !object(record.transaction)) return;
    const joined = record.transaction;
    if (joined.successful !== true || joined.hash !== item.hash || typeof joined.envelope_xdr !== "string" || joined.envelope_xdr.length > 200_000) return;
    const outer = TransactionBuilder.fromXDR(joined.envelope_xdr, Networks.TESTNET);
    const tx = outer instanceof FeeBumpTransaction ? outer.innerTransaction : outer;
    if (outer.hash().toString("hex") !== item.hash && tx.hash().toString("hex") !== item.hash) return;
    if (tx.operations.length !== 1) return;
    const operation = tx.operations[0];
    if (operation.type !== "invokeHostFunction" || operation.func.switch().name !== "hostFunctionTypeInvokeContract") return;
    const invocation = operation.func.invokeContract(), contractId = Address.fromScAddress(invocation.contractAddress()).toString();
    if (item.counterparty !== contractId || !StrKey.isValidContract(contractId)) return;
    const method = invocation.functionName().toString(), args = invocation.args();
    const source = operation.source ?? tx.source;
    if (record.source_account !== source) return;
    const addr = (index: number) => args[index]?.switch().name === "scvAddress" ? Address.fromScVal(args[index]).toString() : null;
    const id = (index: number, kind: "scvU32" | "scvU64") => {
      if (args[index]?.switch().name !== kind) return null;
      const value = String(scValToNative(args[index]));
      return /^[1-9]\d{0,19}$/.test(value) ? value : null;
    };
    const amount = (index: number) => args[index]?.switch().name === "scvI128" && String(scValToNative(args[index])) === item.amountStroops;
    const sent = item.direction === "sent" && source === viewer;
    const received = item.direction === "received";
    const context = (type: WalletActivityContext["type"], referenceId: string | null = null, name: string | null = null): WalletActivityContext => ({ type, contractId, referenceId, title: name });
    if (contractId === configured.campaign) {
      const campaign = id(0, "scvU64");
      if (!campaign) return;
      if (method === "donate" && sent && args.length === 3 && addr(1) === viewer && amount(2)) return context("campaign-donation", campaign);
      if (method === "refund" && received && args.length === 2 && addr(1) === viewer) return context("campaign-refund", campaign);
      if (method === "release" && received && args.length === 1) return context("campaign-payout", campaign);
    }
    if (contractId === configured.arisan) {
      const room = id(0, "scvU32");
      if (room && method === "finalize_draw" && received && args.length === 2 && addr(1) === source) return context("arisan-win", room);
      if (room && method === "deposit_room" && sent && args.length === 3 && addr(1) === viewer && amount(2)) return context("arisan-funding", room);
      if (room && method === "join_room" && sent && args.length === 3 && addr(2) === viewer) return context("arisan-funding", room);
      if (sent && method === "create_room" && addr(0) === viewer && args.length === 8
        && args[2].switch().name === "scvString") return context("arisan-funding", null, title(scValToNative(args[2])));
      if (room && received && ["leave_room", "cancel_room", "emergency_dissolve"].includes(method) && args.length === 2 && addr(1) === source) return context("arisan-refund", room);
    }
    if (contractId === configured.disaster) {
      if (method === "contribute" && sent && args.length === 2 && addr(0) === viewer && amount(1)) return context("disaster-contribution");
      if (method === "execute" && received && args.length === 2 && addr(0) === source && id(1, "scvU64")) return context("disaster-payout", id(1, "scvU64"));
    }
    if (contractId === configured.paluwagan) {
      if (method === "contribute" && sent && args.length === 1 && addr(0) === viewer) return context("paluwagan-funding");
      if (method === "payout" && received && args.length === 0) return context("paluwagan-payout");
    }
    if (contractId === configured.savings) {
      if (method === "deposit" && sent && args.length === 2 && addr(0) === viewer && amount(1)) return context("savings-deposit");
      if (method === "withdraw" && received && args.length === 1 && addr(0) === viewer) return context("savings-withdrawal");
    }
  } catch { /* Purpose is optional; never hide a verified asset movement. */ }
}

export function attachActivityContexts(items: WalletActivityItem[], records: unknown[], viewer: string): WalletActivityItem[] {
  const byId = new Map(records.filter(object).map(record => [String(record.id), record]));
  const configured = deployments();
  return items.map(item => {
    const context = activityContextFromRecord(item, byId.get(item.id.split(":")[0]), viewer, configured);
    return context ? { ...item, context } : item;
  });
}

/** Public titles only. Independent from registry/photos, capped and parallel,
 * with one 2-second deadline. No extra getAccount call, signing or submission.
 * An unavailable title still displays the receipt-derived campaign/room ID. */
export async function readActivityContextTitles(items: WalletActivityItem[], viewer: string): Promise<WalletActivityItem[]> {
  const candidates = new Map<string, WalletActivityContext>();
  for (const { context } of items) if (context?.referenceId && /^(campaign|arisan)-/.test(context.type)) candidates.set(`${context.contractId}:${context.referenceId}`, context);
  const names = new Map<string, string>(), snapshots = new Map<string, unknown>(), deadline = Date.now() + 2_000;
  // Discovery metadata is not linkage proof. It is checked against the full
  // immutable contract config below, never inferred from a QA-looking title.
  const mappingsRead = [...candidates.values()].some(context => context.type.startsWith("campaign-"))
    ? readCircleDiscoveryMappings().catch(() => []) : Promise.resolve([]);
  let next = 0;
  const pending = [...candidates.entries()].slice(0, 8);
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    while (next < pending.length && Date.now() < deadline) {
      const [key, context] = pending[next++];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const campaign = context.type.startsWith("campaign-");
        const argument = campaign ? nativeToScVal(BigInt(context.referenceId!), { type: "u64" })
          : nativeToScVal(Number(context.referenceId), { type: "u32" });
        const transaction = new TransactionBuilder(new Account(viewer, "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
          .addOperation(new Contract(context.contractId).call(campaign ? "campaign" : "get_room", argument)).setTimeout(30).build();
        const remaining = Math.max(1, deadline - Date.now());
        const response = await Promise.race([new rpc.Server(RPC_URL, { timeout: remaining }).simulateTransaction(transaction), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("Context deadline")), remaining);
        })]);
        if (!rpc.Api.isSimulationSuccess(response) || !response.result || Date.now() >= deadline) continue;
        const raw = scValToNative(response.result.retval);
        snapshots.set(key, raw);
        const matches = object(raw) && (campaign ? String(raw.id) === context.referenceId : typeof raw.host === "string" && StrKey.isValidEd25519PublicKey(raw.host));
        const name = matches ? title(raw[campaign ? "title" : "name"]) : null;
        if (name) names.set(key, name);
      } catch { /* Honest campaign/room ID fallback, never a guessed cause. */ }
      finally { if (timer) clearTimeout(timer); }
    }
  }));
  const linked = new Map<string, { name: string; circleId: string }>();
  for (const mapping of await mappingsRead) {
    const key = `${donationCampaignId()}:${mapping.campaignId}`;
    if (!validatedCircleTestnetCampaign(snapshots.get(key), mapping, CONTRACTS.tokenXlmSac)) continue;
    const circle = SEED_CIRCLES.find(circle => circle.id === mapping.circleId);
    if (circle) linked.set(key, { name: `QA · ${circle.title}`, circleId: circle.id });
  }
  return items.map(item => {
    if (!item.context) return item;
    const key = `${item.context.contractId}:${item.context.referenceId}`, circle = linked.get(key);
    return { ...item, context: { ...item.context, title: circle?.name ?? names.get(key) ?? item.context.title, ...(circle ? { circleId: circle.circleId } : {}) } };
  });
}
