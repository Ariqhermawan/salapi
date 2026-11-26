import { redirect } from "next/navigation";
import ArisanListScreen from "@/components/screens/ArisanListScreen";
import ArisanRoomScreen from "@/components/screens/ArisanRoomScreen";
import { isLocalPreview } from "@/lib/local-preview";

const scenarios = new Set(["countdown", "draw-member", "draw-master", "master-away"]);

export default async function ArisanSampleAliasPage({ params }: { params: Promise<{ parts?: string[] }> }) {
  const { parts = [] } = await params;
  if (parts.length === 0 && isLocalPreview) return <ArisanListScreen />;
  if (parts.length === 0) redirect("/vaults");
  const scenario = parts[0] === "state" ? parts[1] : undefined;
  if (scenario && scenarios.has(scenario) && isLocalPreview) {
    const roomId = scenario === "countdown" ? 1 : 2;
    return <ArisanRoomScreen roomId={roomId} previewScenario={scenario as "countdown" | "draw-member" | "draw-master" | "master-away"} />;
  }
  // State samples in the prototype are illustrative. Production users land on
  // the real Testnet room list instead of seeing those samples as real rooms.
  redirect("/vaults");
}
