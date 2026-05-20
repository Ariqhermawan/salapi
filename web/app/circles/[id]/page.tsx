import { notFound } from "next/navigation";
import CircleDetailScreen from "@/components/screens/CircleDetailScreen";
import { getCircle } from "@/lib/circles/seed";

export const metadata = {
  title: "Circle · Salapi Circles preview",
};

// Next 16: route segment params arrive as a Promise; await before use.
export default async function CircleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const circle = getCircle(id);
  if (!circle) notFound();
  return <CircleDetailScreen circle={circle} />;
}
