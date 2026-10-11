import ArisanCreateScreen from "@/components/screens/ArisanCreateScreen";
import ArisanFundingScreen from "@/components/screens/ArisanFundingScreen";

export const metadata = { title: "New Arisan Room · Salapi" };

export default function ArisanCreatePage() {
  return process.env.NEXT_PUBLIC_ARISAN_SCHEDULED === "1" ? <ArisanFundingScreen scheduled /> : <ArisanCreateScreen />;
}
