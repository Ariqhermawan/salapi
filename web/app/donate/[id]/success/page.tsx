import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { resolveCampaignRouteId } from "@/lib/prototype-campaign-route";
import { PROTOTYPE_CAUSES } from "@/lib/prototype-causes";
import PrototypeDonationScreen from "@/components/screens/PrototypeDonationScreen";

export default async function DonateSuccessAliasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ amount?: string }> }) {
  const { id } = await params;
  const { amount } = await searchParams;
  if (isLocalPreview && PROTOTYPE_CAUSES.some(cause => cause.id === id))
    return <PrototypeDonationScreen id={id} step="success" amount={typeof amount === "string" ? amount : ""} />;
  const campaignId = resolveCampaignRouteId(id, isLocalPreview);
  if (campaignId) redirect(`/campaigns?id=${encodeURIComponent(campaignId)}`);
  redirect("/campaigns?mode=testnet");
}
