"use server";

import { arisanList, disasterState, paluwaganState } from "./actions";
import { campaignState } from "./campaign-actions";
import { isLocalPreview } from "@/lib/local-preview";

type VaultOverview = {
  rooms: Awaited<ReturnType<typeof arisanList>>;
  campaigns: Awaited<ReturnType<typeof campaignState>>;
  pool: Awaited<ReturnType<typeof disasterState>>;
  legacyCircle: Awaited<ReturnType<typeof paluwaganState>> | null;
};

function unavailableVaults(): VaultOverview {
  return {
    rooms: { ready: false, error: "We couldn't load your rooms." },
    campaigns: { ok: false, error: "We couldn't load your campaigns." },
    pool: { ok: false, error: "The community pool is temporarily unavailable." },
    legacyCircle: null,
  };
}

/** One request, overlapping read-only sources. Never cache personal results. */
export async function vaultOverview(): Promise<VaultOverview> {
  // Local examples are supplied by the UI, not by deployed ledger/auth reads.
  if (isLocalPreview) return unavailableVaults();
  const [rooms, campaigns, pool, legacyCircle] = await Promise.allSettled([
    arisanList(),
    campaignState(),
    disasterState(),
    paluwaganState(),
  ]);
  const unavailable = unavailableVaults();
  return {
    rooms: rooms.status === "fulfilled" ? rooms.value : unavailable.rooms,
    campaigns: campaigns.status === "fulfilled" ? campaigns.value : unavailable.campaigns,
    pool: pool.status === "fulfilled" ? pool.value : unavailable.pool,
    legacyCircle: legacyCircle.status === "fulfilled" ? legacyCircle.value : unavailable.legacyCircle,
  };
}
