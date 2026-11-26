import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { resolveCampaignRouteId } from "@/lib/prototype-campaign-route";

export const metadata = { title: "Report cause · Salapi" };
export default async function CauseReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaignId = resolveCampaignRouteId(id, isLocalPreview);
  if (!campaignId) redirect("/campaigns?mode=testnet");
  redirect(`/campaigns?id=${encodeURIComponent(campaignId)}&report=1`);
}
