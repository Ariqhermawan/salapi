import CampaignScreen from "@/components/screens/CampaignScreen";
import CirclesDiscoverScreen from "@/components/screens/CirclesDiscoverScreen";
import CampaignDiscoveryNav from "@/components/CampaignDiscoveryNav";
import { campaignDiscoveryView } from "@/lib/campaign-discovery";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Donation campaigns · Salapi", description: "Browse fictional Circles examples by category, or explore separate Testnet campaign escrow, proof review, and donor refunds." };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ id?: string; create?: string; mode?: string }> }) {
  const { id, create, mode } = await searchParams;
  const campaignId = typeof id === "string" ? id : "";
  const view = campaignDiscoveryView({ id: campaignId, create, mode }, isLocalPreview);
  // A different campaign must not inherit the previous page's draft or async reads.
  return <><CampaignDiscoveryNav view={view} />{view === "examples"
    ? <CirclesDiscoverScreen campaignEntry />
    : <CampaignScreen key={`${campaignId}:${create === "1" ? "create" : "view"}`} id={campaignId} initialCreate={create === "1"} />}</>;
}
