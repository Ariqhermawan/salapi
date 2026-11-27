import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeArisanCreateScreen from "@/components/screens/PrototypeArisanCreateScreen";

export default function CreateRoomAliasPage() {
  if (isLocalPreview) return <PrototypeArisanCreateScreen />;
  redirect("/arisan/new");
}
