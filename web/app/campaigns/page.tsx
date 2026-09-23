import CampaignScreen from "@/components/screens/CampaignScreen";

export const metadata = { title: "Donation campaigns · Salapi", description: "Testnet campaign escrow, proof review, and donor refunds." };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const campaignId = typeof id === "string" ? id : "";
  // A different campaign must not inherit the previous page's draft or async reads.
  return <CampaignScreen key={campaignId} id={campaignId} />;
}
