import { redirect } from "next/navigation";

export default async function LegacyCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/cause/${encodeURIComponent(id)}`);
}
