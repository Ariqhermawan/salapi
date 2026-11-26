import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { resolveCampaignRouteId } from "@/lib/prototype-campaign-route";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import PrototypeCauseDetailScreen from "@/components/screens/PrototypeCauseDetailScreen";

export default async function CauseAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isLocalPreview && (PROTOTYPE_CAUSES.some(cause => cause.id === id) || /^local-[0-9a-z-]+$/.test(id)))
    return <PrototypeCauseDetailScreen id={id} />;
  const campaignId = resolveCampaignRouteId(id, isLocalPreview);
  if (campaignId) redirect(`/campaigns?id=${encodeURIComponent(campaignId)}`);
  redirect("/campaigns?mode=testnet");
}
