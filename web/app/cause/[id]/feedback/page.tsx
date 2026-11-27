import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { resolveCampaignRouteId } from "@/lib/prototype-campaign-route";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import PrototypeCauseDetailScreen from "@/components/screens/PrototypeCauseDetailScreen";

export const metadata = { title: "Cause feedback · Salapi" };
export default async function CauseFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (PROTOTYPE_CAUSES.some(cause => cause.id === id))
    return <PrototypeCauseDetailScreen id={id} initialTab="Reviews" />;
  const campaignId = resolveCampaignRouteId(id, isLocalPreview);
  if (!campaignId) redirect("/campaigns?mode=testnet");
  redirect(`/campaigns?id=${encodeURIComponent(campaignId)}#campaign-reviews`);
}
