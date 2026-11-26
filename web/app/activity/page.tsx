import ActivityScreen from "@/components/screens/ActivityScreen";
import PrototypeActivityScreen from "@/components/screens/PrototypeActivityScreen";
import { isLocalPreview } from "@/lib/local-preview";

export const metadata = { title: "Activity · Salapi" };

export default function ActivityPage() {
  return isLocalPreview ? <PrototypeActivityScreen /> : <ActivityScreen />;
}
