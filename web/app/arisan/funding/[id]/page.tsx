import { notFound } from "next/navigation";
import ArisanFundingScreen from "@/components/screens/ArisanFundingScreen";

export const metadata = { title: "Arisan Installment Room · Salapi" };
export default async function ArisanFundingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id) || Number(id)>0xffff_ffff) notFound();
  return <ArisanFundingScreen key={id} roomId={Number(id)} />;
}
