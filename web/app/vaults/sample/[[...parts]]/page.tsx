import { redirect } from "next/navigation";
import ArisanRoomScreen from "@/components/screens/ArisanRoomScreen";
import PrototypeArisanListScreen from "@/components/screens/PrototypeArisanListScreen";
import PrototypeArisanRoomScreen from "@/components/screens/PrototypeArisanRoomScreen";
import { isLocalPreview } from "@/lib/local-preview";

const scenarios = new Set(["countdown", "draw-member", "draw-master", "master-away"]);

export default async function ArisanSampleAliasPage({ params }: { params: Promise<{ parts?: string[] }> }) {
  const { parts = [] } = await params;
  if (parts.length === 0 && isLocalPreview) return <PrototypeArisanListScreen mode="rooms" />;
  if (parts.length === 0) redirect("/vaults");
  const scenario = parts[0] === "state" ? parts[1] : undefined;
  if (scenario && scenarios.has(scenario) && isLocalPreview) {
    const roomId = scenario === "countdown" ? 1 : 2;
    return <ArisanRoomScreen roomId={roomId} previewScenario={scenario as "countdown" | "draw-member" | "draw-master" | "master-away"} />;
  }
  const roomKey = parts[0] === "rooms" ? parts[1] : undefined;
  if ((roomKey === "r_1" || roomKey === "r_4") && isLocalPreview) {
    return <PrototypeArisanRoomScreen roomKey={roomKey} />;
  }
  const roomId = roomKey ? Number(roomKey) : 0;
  if (roomKey && Number.isFinite(roomId) && roomId > 0 && isLocalPreview) {
    return <ArisanRoomScreen roomId={roomId} />;
  }
  // State samples in the prototype are illustrative. Production users land on
  // the real Testnet room list instead of seeing those samples as real rooms.
  redirect("/vaults");
}
