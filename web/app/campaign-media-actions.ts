"use server";

import { readCampaignMedia, publishCampaignMedia } from "@/lib/server/campaignMedia";
import type { CampaignMediaResult } from "@/lib/campaign-media";

export async function campaignMedia(campaignId: string): Promise<CampaignMediaResult> {
  return readCampaignMedia(campaignId);
}

export async function saveCampaignMedia(campaignId: string, expectedOwnerId: string, formData: FormData): Promise<CampaignMediaResult> {
  return publishCampaignMedia(campaignId, expectedOwnerId, formData);
}
