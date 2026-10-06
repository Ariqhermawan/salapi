import { notFound } from "next/navigation";
import CirclesOrganizerScreen from "@/components/screens/CirclesOrganizerScreen";
import { getCircle, SEED_CIRCLES } from "@/lib/circles/seed";
import { getOrganizerForCircle } from "@/lib/circles/organizers";
import type { Circle } from "@/lib/circles/types";

export const metadata = {
  title: "Example organizer profile · Salapi Circles preview",
};

export default async function CircleOrganizerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const circle = getCircle(id);
  if (!circle) notFound();
  const organizer = getOrganizerForCircle(circle);
  if (!organizer) notFound();

  const causes = SEED_CIRCLES.filter(
    (cause) => cause.organizerId === organizer.id,
  );
  const history = organizer.historyIds
    .map(getCircle)
    .filter((cause): cause is Circle => !!cause && cause.organizerId === organizer.id && cause.status === "completed");

  return <CirclesOrganizerScreen circle={circle} organizer={organizer} causes={causes} history={history} />;
}
