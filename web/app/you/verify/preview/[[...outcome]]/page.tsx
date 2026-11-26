import { redirect } from "next/navigation";

export default function VerifyPreviewAliasPage() {
  // The prototype's KYC outcomes are illustrative. Live KYC is not configured,
  // so route every state example to the real verification availability screen.
  redirect("/you/kyc-tier");
}
