import WorkspaceOrganizer from "@/components/circles/WorkspaceOrganizer";
import { workspaceSnapshot } from "@/app/circle-workspace-actions";

export const metadata = { title: "Organizer history and ratings · Salapi" };

export default async function WorkspaceOrganizerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await workspaceSnapshot(id);
  return <WorkspaceOrganizer initialSnapshot={snapshot} campaignId={id} />;
}
