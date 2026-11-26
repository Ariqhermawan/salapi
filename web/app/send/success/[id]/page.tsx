import { redirect } from "next/navigation";

export default async function SendReceiptAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/tx/${encodeURIComponent(id)}`);
}
