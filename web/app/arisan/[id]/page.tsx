import ArisanRoomScreen from "@/components/screens/ArisanRoomScreen";

export const metadata = { title: "Arisan Room · Salapi" };

// Next 16: route segment params arrive as a Promise; await before use.
export default async function ArisanRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const roomId = Number(id);
  return <ArisanRoomScreen roomId={Number.isFinite(roomId) ? roomId : 0} />;
}
