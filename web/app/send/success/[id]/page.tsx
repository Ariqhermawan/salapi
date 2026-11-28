import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { isPreviewTransferId } from "@/lib/local-preview-history";

export default async function SendReceiptAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isLocalPreview && id.startsWith("local-send-")) {
    if (isPreviewTransferId(id)) redirect(`/activity/${encodeURIComponent(id)}`);
    redirect("/activity");
  }
  redirect(`/tx/${encodeURIComponent(id)}`);
}
