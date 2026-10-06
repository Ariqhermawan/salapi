import WalletSetupScreen from "@/components/screens/WalletSetupScreen";

export const metadata = { title: "Wallet setup · Salapi" };

export default async function WalletSetupPage({ searchParams }: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  return <WalletSetupScreen nextPath={typeof params.next === "string" ? params.next : "/"} />;
}
