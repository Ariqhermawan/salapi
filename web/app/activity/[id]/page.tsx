import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeActivityDetailScreen from "@/components/screens/PrototypeActivityDetailScreen";

export default async function ActivityReceiptAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isLocalPreview && (/^a[1-5]$/.test(id) || id === "referral-reward" || /^local-send-[a-zA-Z0-9-]{1,80}$/.test(id)))
    return <PrototypeActivityDetailScreen id={id} />;
  redirect(`/tx/${encodeURIComponent(id)}`);
}
