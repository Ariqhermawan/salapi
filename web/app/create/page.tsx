import { Suspense } from "react";
import Link from "next/link";
import CampaignScreen from "@/components/screens/CampaignScreen";
import PrototypeCreateCauseScreen from "@/components/screens/PrototypeCreateCauseScreen";
import RecurringCampaignScreen from "@/components/screens/RecurringCampaignScreen";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Create a cause · Salapi", description: "Create a campaign on Stellar Testnet with fixed recipients, deadlines, and three reviewers." };

export default async function CreateCausePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind } = await searchParams;
  if (isLocalPreview) return <Suspense fallback={null}><PrototypeCreateCauseScreen /></Suspense>;
  if (kind === "recurring") return <RecurringCampaignScreen standaloneCreate />;
  return <><nav aria-label="Campaign type" style={{ display: "flex", justifyContent: "center", gap: 16, padding: 12 }}>
      <Link href="/create">One-time campaign</Link><Link href="/create?kind=recurring">Recurring stages</Link>
    </nav><CampaignScreen id="" initialCreate standaloneCreate /></>;
}
