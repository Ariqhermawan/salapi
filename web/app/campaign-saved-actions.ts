"use server";

import { readSavedCampaigns, setSavedCampaign } from "@/lib/server/savedCampaigns";

export async function readAccountSavedCampaigns(expectedOwnerId: unknown) {
  return readSavedCampaigns(expectedOwnerId);
}

export async function setAccountSavedCampaign(campaignId: unknown, saved: unknown, expectedOwnerId: unknown) {
  return setSavedCampaign(campaignId, saved, expectedOwnerId);
}
