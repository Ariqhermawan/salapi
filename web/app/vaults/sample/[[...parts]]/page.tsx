import { redirect } from "next/navigation";
import ArisanRoomScreen from "@/components/screens/ArisanRoomScreen";
import PrototypeArisanListScreen from "@/components/screens/PrototypeArisanListScreen";
import PrototypeArisanRoomScreen from "@/components/screens/PrototypeArisanRoomScreen";
import PrototypeArisanStateScreen from "@/components/screens/PrototypeArisanStateScreen";
import PrototypeSampleNotice from "@/components/PrototypeSampleNotice";
import { isLocalPreview } from "@/lib/local-preview";

const scenarios = new Set(["countdown", "draw-member", "draw-master", "master-away"]);

export default async function ArisanSampleAliasPage({ params }: { params: Promise<{ parts?: string[] }> }) {
  const { parts = [] } = await params;
  if (parts.length === 0) return <><PrototypeSampleNotice kind="arisan-list" /><PrototypeArisanListScreen mode="rooms" /></>;
  const scenario = parts[0] === "state" ? parts[1] : undefined;
  if (scenario && scenarios.has(scenario)) {
    return <><PrototypeSampleNotice kind="arisan-draw" /><PrototypeArisanStateScreen scenario={scenario as "countdown" | "draw-member" | "draw-master" | "master-away"} /></>;
  }
  const roomKey = parts[0] === "rooms" ? parts[1] : undefined;
  if (roomKey === "r_1" || roomKey === "r_4" || roomKey === "r_done") {
    return <><PrototypeSampleNotice kind="arisan-room" /><PrototypeArisanRoomScreen roomKey={roomKey} /></>;
  }
  const roomId = roomKey ? Number(roomKey) : 0;
  if (roomKey && Number.isFinite(roomId) && roomId > 0 && isLocalPreview) {
    return <ArisanRoomScreen roomId={roomId} />;
  }
  // Keep arbitrary room ids on the real Testnet route, never in the sample UI.
  redirect("/vaults");
}
