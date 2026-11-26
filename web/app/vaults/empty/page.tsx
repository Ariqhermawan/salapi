import { redirect } from "next/navigation";
import ArisanListScreen from "@/components/screens/ArisanListScreen";
import { isLocalPreview } from "@/lib/local-preview";

export default function ArisanEmptyAliasPage() {
  if (isLocalPreview) return <ArisanListScreen emptyPreview />;
  redirect("/vaults");
}
