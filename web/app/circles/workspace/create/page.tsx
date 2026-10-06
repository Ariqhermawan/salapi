import PublishCampaignScreen from "@/components/circles/PublishCampaignScreen";
import { workspaceSnapshot } from "@/app/circle-workspace-actions";

export const metadata = { title: "Publish a community campaign · Salapi" };
export const dynamic = "force-dynamic";

export default async function PublishCampaignPage() {
  return <PublishCampaignScreen snapshot={await workspaceSnapshot()} />;
}
