import InviteScreen from "@/components/screens/InviteScreen";
import { readOwnReferral } from "@/lib/server/referrals";

export const metadata = { title: "Invite friends · Salapi" };

export default async function InvitePage() {
  return <InviteScreen referral={await readOwnReferral()} />;
}
