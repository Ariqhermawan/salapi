import "server-only";
import { readAccountWallet } from "./accountWallet";
import { CONTRACTS, donationCampaignId, readContract, sc } from "./stellar";
import { campaignSupportIds, type CampaignSupport } from "@/lib/campaign-support";
import { circleTestnetSlugs } from "@/lib/circles/testnet";
import { readCircleDiscoveryMappings } from "./circlesTestnet";

export async function readCircleCampaignSupport(input: unknown) {
  const slugs = typeof input === "string" && input.length <= 2186 ? circleTestnetSlugs(input.split(",")) : null;
  if (!slugs) return { ok: false as const, code: "invalid_input" };
  const mappings = (await readCircleDiscoveryMappings()).filter(mapping => slugs.includes(mapping.circleId));
  if (!mappings.length) return { ok: false as const, code: "unavailable" };
  const result = await readCampaignSupport(mappings.map(mapping => mapping.campaignId).join(","));
  return result.ok ? { ...result, circleCampaigns: Object.fromEntries(mappings.map(mapping => [mapping.circleId, mapping.campaignId])) } : result;
}

export async function readCampaignSupport(input: unknown) {
  const ids = campaignSupportIds(input);
  if (!ids) return { ok: false as const, code: "invalid_input" };
  const owner = await readAccountWallet();
  if (!owner.ok) return owner;
  const contributions: Record<string, CampaignSupport> = Object.fromEntries(ids.map(id => [id, { amount: "0", status: "unavailable" }]));
  const deadline = Date.now() + 8_000;
  async function bounded<T>(operation: Promise<T>) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Error("Support unavailable")), Math.max(1, deadline - Date.now()));
    })]); } finally { clearTimeout(timer); }
  }
  try {
    const contract = donationCampaignId();
    if (!contract) throw Error("Unconfigured");
    const [version, token] = await bounded(Promise.all([readContract(contract, "version"), readContract(contract, "token")]));
    if (version !== 4 || token !== CONTRACTS.tokenXlmSac) throw Error("Invalid deployment");
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (next < ids.length && Date.now() < deadline) {
        const id = ids[next++];
        try {
          const value = await bounded(readContract(contract, "contribution", [sc.u64(BigInt(id)), sc.addr(owner.address)])) as { amount: bigint; refunded: boolean };
          if (typeof value?.amount !== "bigint" || value.amount < 0n || value.amount >= (1n << 127n) || typeof value.refunded !== "boolean") continue;
          contributions[id] = { amount: value.amount.toString(), status: value.amount > 0n ? value.refunded ? "refunded" : "donated" : "none" };
        } catch { /* A failed read never becomes a false 'not donated'. */ }
      }
    }));
    return { ok: true as const, ownerId: owner.ownerId, contributions };
  } catch { return { ok: false as const, ownerId: owner.ownerId, code: "unavailable" }; }
}
