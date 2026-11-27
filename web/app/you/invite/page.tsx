import PrototypeReferralsScreen from "@/components/screens/PrototypeReferralsScreen";
import { readOwnReferral } from "@/lib/server/referrals";

export const metadata = { title: "Invite friends · Salapi" };

export default async function InvitePage() {
  return <PrototypeReferralsScreen referral={await readOwnReferral()} />;
}
