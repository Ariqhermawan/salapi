import { redirect } from "next/navigation";
import ArisanPreviewFixturesScreen from "@/components/screens/ArisanPreviewFixturesScreen";
import { isLocalPreview } from "@/lib/local-preview";

export default function ArisanPreviewPage() {
  if (!isLocalPreview) redirect("/arisan");
  return <ArisanPreviewFixturesScreen />;
}
