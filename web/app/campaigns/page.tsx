import CampaignScreen from "@/components/screens/CampaignScreen";
import RecurringCampaignScreen from "@/components/screens/RecurringCampaignScreen";
import CampaignCausesScreen from "@/components/screens/CampaignCausesScreen";
import CirclesDiscoverScreen from "@/components/screens/CirclesDiscoverScreen";
import CampaignDiscoveryNav from "@/components/CampaignDiscoveryNav";
import { campaignDiscoveryView } from "@/lib/campaign-discovery";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Donation campaigns · Salapi", description: "Browse fictional Circles examples by category, or explore separate Testnet campaign escrow, proof review, and donor refunds." };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ id?: string; create?: string; mode?: string; report?: string; fixture?: string }> }) {
  const { id, create, mode, report, fixture } = await searchParams;
  const campaignId = typeof id === "string" ? id : "";
  if (campaignId.startsWith("r") || mode === "recurring")
    return <RecurringCampaignScreen key={`recurring:${campaignId}:${fixture ?? ""}`} id={campaignId} fixture={fixture} />;
  const view = campaignDiscoveryView({ id: campaignId, create, mode }, isLocalPreview);
  // A different campaign must not inherit the previous page's draft or async reads.
  if (view === "examples") return <><CampaignDiscoveryNav view={view} /><CirclesDiscoverScreen campaignEntry />
  </>;
  if (campaignId || create === "1") return <CampaignScreen key={campaignId + ":" + (create === "1" ? "create" : "view") + ":" + (report === "1" ? "report" : "normal")} id={campaignId} initialCreate={create === "1"} initialReport={report === "1"} />;
  return <><CampaignDiscoveryNav view={view} /><CampaignCausesScreen /></>;
}
