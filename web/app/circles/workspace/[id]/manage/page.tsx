import WorkspaceManage from "@/components/circles/WorkspaceManage";
import { workspaceSnapshot } from "@/app/circle-workspace-actions";

export const metadata = { title: "Organizer workspace · Salapi" };

export default async function WorkspaceManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await workspaceSnapshot(id);
  return <WorkspaceManage initialSnapshot={snapshot} campaignId={id} />;
}
