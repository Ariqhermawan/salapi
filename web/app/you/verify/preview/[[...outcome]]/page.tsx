import { redirect } from "next/navigation";
import PrototypeKycScreen from "@/components/screens/PrototypeKycScreen";

export default async function VerifyPreviewAliasPage({ params }: { params: Promise<{ outcome?: string[] }> }) {
  // These routes show the prototype's sample-only KYC states. They never read
  // or change a real account's verification status.
  const { outcome = [] } = await params;
  const state = outcome[0];
  if (state && !["pending", "approved", "retry", "rejected", "levels"].includes(state)) redirect("/you/verify/preview");
  return <PrototypeKycScreen state={state} />;
}
