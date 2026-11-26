import ArisanListScreen from "@/components/screens/ArisanListScreen";
import PrototypeArisanListScreen from "@/components/screens/PrototypeArisanListScreen";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Arisan · Salapi" };

export default function VaultsPage() {
  return isLocalPreview ? <PrototypeArisanListScreen /> : <ArisanListScreen />;
}
