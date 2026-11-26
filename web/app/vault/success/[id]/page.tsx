import { redirect } from "next/navigation";

export default async function DisasterVaultReceiptAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tx/${encodeURIComponent(id)}`);
}
