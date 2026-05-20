import { notFound } from "next/navigation";
import CirclesDonateScreen from "@/components/screens/CirclesDonateScreen";
import { getCircle } from "@/lib/circles/seed";

export const metadata = { title: "Donate · Salapi Circles preview" };

export default async function CirclesDonatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const circle = getCircle(id);
  if (!circle) notFound();
  return <CirclesDonateScreen circle={circle} />;
}
