import ArisanListScreen from "@/components/screens/ArisanListScreen";
import PrototypeArisanListScreen from "@/components/screens/PrototypeArisanListScreen";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Arisan · Salapi" };

export default function VaultsPage() {
  // Match the prototype's first-visit empty state in local review mode. Once a
  // visitor creates or joins a local room, PrototypeArisanListScreen hands off
  // to the functional list screen. Production continues to read live rooms.
  if (isLocalPreview) return <PrototypeArisanListScreen />;
  return <ArisanListScreen />;
}
