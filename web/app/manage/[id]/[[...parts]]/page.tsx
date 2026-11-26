import { notFound, redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { resolveCampaignRouteId } from "@/lib/prototype-campaign-route";
import PrototypeManageScreen from "@/components/screens/PrototypeManageScreen";

export default async function ManageCauseAliasPage({ params }: { params: Promise<{ id: string; parts?: string[] }> }) {
  const { id, parts = [] } = await params;
  if (isLocalPreview && (id === "mei" || /^local-[0-9a-z-]+$/.test(id))) {
    const mode = parts.length === 0 ? "hub" : parts[0] === "payout" ? "payout" : "sub";
    return <PrototypeManageScreen id={id} mode={mode} section={parts.join("/")} />;
  }
  const campaignId = resolveCampaignRouteId(id, isLocalPreview);
  if (!campaignId) {
    if (!/^[a-z0-9-]{1,64}$/i.test(id)) notFound();
    redirect("/campaigns?mode=testnet&mine=1");
  }
  const anchor = parts.some(part => ["proof", "release", "payout"].includes(part)) ? "#campaign-proof"
    : parts.some(part => ["donations", "updates"].includes(part)) ? "#campaign-activity" : "#campaign-story";
  // D4 fixes recipients, reviewer set, creator share and deadlines at creation.
  // The detail page exposes the supported on-chain controls instead of implying
  // that immutable contract terms can be edited after deployment.
  redirect(`/campaigns?id=${encodeURIComponent(campaignId)}${anchor}`);
}
