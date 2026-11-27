import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeArisanRoomScreen from "@/components/screens/PrototypeArisanRoomScreen";

export default async function ArisanRoomAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "joined" && isLocalPreview) return <PrototypeArisanRoomScreen roomKey="joined" />;
  if (isLocalPreview) return <PrototypeArisanRoomScreen roomKey={id} />;
  redirect(`/arisan/${encodeURIComponent(id)}`);
}
