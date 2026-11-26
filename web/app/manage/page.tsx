import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeManageScreen from "@/components/screens/PrototypeManageScreen";

export default function ManageCausesPage() {
  if (isLocalPreview) return <PrototypeManageScreen mode="list" />;
  redirect("/campaigns?mode=testnet&mine=1");
}
