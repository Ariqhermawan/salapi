import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeCausesScreen from "@/components/screens/PrototypeCausesScreen";

export default function CausesAliasPage() {
  if (isLocalPreview) return <PrototypeCausesScreen />;
  redirect("/campaigns?mode=testnet");
}
