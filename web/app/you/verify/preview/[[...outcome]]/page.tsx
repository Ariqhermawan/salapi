import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/local-preview";
import PrototypeKycScreen from "@/components/screens/PrototypeKycScreen";

export default async function VerifyPreviewAliasPage({ params }: { params: Promise<{ outcome?: string[] }> }) {
  // These routes mirror the prototype's sample-only verification states. They
  // never read or change a real account's KYC status.
  if (!isLocalPreview) redirect("/you/kyc-tier");
  const { outcome = [] } = await params;
  const state = outcome[0];
  if (state && !["pending", "approved", "retry", "rejected", "levels"].includes(state)) redirect("/you/verify/preview");
  return <PrototypeKycScreen state={state} />;
}
