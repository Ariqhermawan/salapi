import PrototypeReferralsScreen from "@/components/screens/PrototypeReferralsScreen";
import { readOwnReferral } from "@/lib/server/referrals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals · Salapi" };

export default async function ReferralsPage() {
  return <PrototypeReferralsScreen referral={await readOwnReferral()} />;
}
