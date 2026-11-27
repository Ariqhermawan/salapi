import { Suspense } from "react";
import CampaignScreen from "@/components/screens/CampaignScreen";
import PrototypeCreateCauseScreen from "@/components/screens/PrototypeCreateCauseScreen";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Create a cause · Salapi", description: "Create a campaign on Stellar Testnet with fixed recipients, deadlines, and three reviewers." };

export default function CreateCausePage() {
  return isLocalPreview
    ? <Suspense fallback={null}><PrototypeCreateCauseScreen /></Suspense>
    : <CampaignScreen id="" initialCreate standaloneCreate />;
}
