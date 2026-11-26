import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeCreateCauseScreen from "@/components/screens/PrototypeCreateCauseScreen";

export default function CreateCauseAliasPage() {
  if (isLocalPreview) return <PrototypeCreateCauseScreen />;
  redirect("/campaigns?create=1");
}
