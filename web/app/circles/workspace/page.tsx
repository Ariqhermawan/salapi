import WorkspaceList from "@/components/circles/WorkspaceList";
import { workspaceSnapshot } from "@/app/circle-workspace-actions";

export const metadata = { title: "Campaign workspace · Salapi", description: "Publish user campaigns, follow organizer updates and review completed delivery." };

export default async function CampaignWorkspacePage() {
  return <WorkspaceList initialSnapshot={await workspaceSnapshot()} />;
}
