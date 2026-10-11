import ArisanFundingScreen from "@/components/screens/ArisanFundingScreen";

export const metadata = { title: "Scheduled Arisan Room · Salapi" };
export default async function ScheduledRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArisanFundingScreen roomId={Number(id)} scheduled />;
}
