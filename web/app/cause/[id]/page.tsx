import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { resolveCampaignRouteId } from "@/lib/prototype-campaign-route";

export default async function CauseAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = resolveCampaignRouteId(id, isLocalPreview);
  if (campaignId) redirect(`/campaigns?id=${encodeURIComponent(campaignId)}`);
  redirect("/campaigns?mode=testnet");
}
