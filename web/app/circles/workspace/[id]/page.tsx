import WorkspaceDetail from "@/components/circles/WorkspaceDetail";
import { workspaceSnapshot } from "@/app/circle-workspace-actions";

export const metadata = { title: "Campaign updates · Salapi" };

export default async function WorkspaceCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await workspaceSnapshot(id);
  return <WorkspaceDetail initialSnapshot={snapshot} campaignId={id} />;
}
