import { notFound, redirect } from "next/navigation";

export default async function CreatedCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9][0-9]{0,19}$/.test(id)) notFound();
  redirect(`/campaigns?id=${encodeURIComponent(id)}`);
}
