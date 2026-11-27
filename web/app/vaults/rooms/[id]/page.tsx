import { redirect } from "next/navigation";

export default async function ArisanRoomAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id === "joined") redirect("/arisan");
  redirect(`/arisan/${encodeURIComponent(id)}`);
}
