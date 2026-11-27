import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeArisanJoinScreen from "@/components/screens/PrototypeArisanJoinScreen";

export default function JoinRoomAliasPage() {
  if (isLocalPreview) return <PrototypeArisanJoinScreen />;
  redirect("/arisan/join");
}
