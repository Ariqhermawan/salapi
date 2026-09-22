import CampaignScreen from "@/components/screens/CampaignScreen";

export const metadata = { title: "Donation campaigns · Salapi", description: "Testnet campaign escrow, proof review, and donor refunds." };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  return <CampaignScreen id={typeof id === "string" ? id : ""} />;
}
