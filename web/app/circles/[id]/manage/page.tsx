import { notFound } from "next/navigation";
import CircleManageScreen from "@/components/screens/CircleManageScreen";
import { getCircle } from "@/lib/circles/seed";

export const metadata = {
  title: "Manage circle · Salapi Circles preview",
};

export default async function CircleManagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const circle = getCircle(id);
  if (!circle) notFound();
  return <CircleManageScreen circle={circle} />;
}
