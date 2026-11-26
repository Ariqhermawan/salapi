import { redirect } from "next/navigation";
import { referralInviteRedirect } from "@/lib/server/referrals";

export default async function ReferralLinkPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(await referralInviteRedirect(code));
}
