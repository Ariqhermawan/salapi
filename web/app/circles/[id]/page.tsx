import { notFound } from "next/navigation";
import CircleDetailScreen from "@/components/screens/CircleDetailScreen";
import { getCircle } from "@/lib/circles/seed";

export const metadata = {
  title: "Circle · Salapi Circles preview",
};

// Next 16: route segment params arrive as a Promise; await before use.
export default async function CircleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const circle = getCircle(id);
  if (!circle) notFound();
  const initialTab = query.tab === "updates" ? "updates" : query.tab === "proof" ? "proof" : "story";
  return <CircleDetailScreen key={`${circle.id}-${initialTab}`} circle={circle} initialTab={initialTab} />;
}
