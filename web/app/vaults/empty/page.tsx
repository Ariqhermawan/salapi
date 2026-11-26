import { redirect } from "next/navigation";
import PrototypeArisanListScreen from "@/components/screens/PrototypeArisanListScreen";
import { isLocalPreview } from "@/lib/local-preview";

export default function ArisanEmptyAliasPage() {
  if (isLocalPreview) return <PrototypeArisanListScreen mode="empty" />;
  redirect("/vaults");
}
