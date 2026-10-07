"use server";

import { readCircleTestnetCampaign as readSingle, readCirclesTestnetCampaigns as readBatch } from "@/lib/server/circlesTestnet";

// Inputs select canonical fictional catalog slugs, never contracts or wallets.
// This is public read-only data, not donation authorization or a cached viewer.
export async function readCircleTestnetCampaign(slug: unknown) {
  return readSingle(slug);
}

export async function readCirclesTestnetCampaigns(slugs?: unknown) {
  return readBatch(slugs);
}
