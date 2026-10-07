"use server";

import type { CampaignUpdateSubscriptionInput, PublishCampaignUpdateInput } from "@/lib/campaign-updates";
import {
  readCampaignUpdateSubscription as readSubscription,
  setCampaignUpdateSubscription as setSubscription,
  readPublicCampaignUpdates as readUpdates,
  publishCampaignUpdate as publishUpdate,
  dispatchCampaignUpdateEmails as dispatchEmails,
} from "@/lib/server/campaignUpdates";

export async function readCampaignUpdateSubscription(campaignId: string) { return readSubscription(campaignId); }
export async function setCampaignUpdateSubscription(input: CampaignUpdateSubscriptionInput) { return setSubscription(input); }
export async function readPublicCampaignUpdates(campaignId: string) { return readUpdates(campaignId); }
export async function publishCampaignUpdate(input: PublishCampaignUpdateInput) { return publishUpdate(input); }
export async function dispatchCampaignUpdateEmails(input: { campaignId: string; updateId: string; expectedOwnerId: string }) { return dispatchEmails(input); }
export async function readCampaignOrganizerUpdates(campaignId: string) {
  const [subscription, updates] = await Promise.all([readSubscription(campaignId), readUpdates(campaignId)]);
  return { subscription, updates };
}
