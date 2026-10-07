"use server";

import { readCampaignDonors, recordCampaignDonor } from "@/lib/server/campaignDonors";

/** Metadata reconciliation only: never signs or resubmits a donation. */
export async function campaignDonorRecord(campaignId: string, input: unknown) {
  return recordCampaignDonor(campaignId, input);
}

/** Public safe projection, not a raw table or auth-user listing. */
export async function campaignDonorActivity(campaignId: string, before = "") {
  return readCampaignDonors(campaignId, before);
}
