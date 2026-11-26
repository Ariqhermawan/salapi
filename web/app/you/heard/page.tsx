import HeardScreen from "@/components/screens/HeardScreen";
import { readSignupSource } from "@/lib/server/referrals";
import { signupReturnPath } from "@/lib/referral";

export const metadata = { title: "How did you hear about Salapi?" };

export default async function HeardPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  const destination = signupReturnPath(typeof next === "string" ? next : "/settings");
  const signup = await readSignupSource();
  return <HeardScreen signup={signup} destination={destination} />;
}
