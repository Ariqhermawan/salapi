import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import { PrototypeDisasterVaultSuccessScreen } from "@/components/screens/PrototypeDisasterVaultScreen";

export default async function DisasterVaultReceiptAliasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isLocalPreview) return <PrototypeDisasterVaultSuccessScreen id={id} />;
  redirect(`/tx/${encodeURIComponent(id)}`);
}
