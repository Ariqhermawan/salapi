import WithdrawScreen from "@/components/screens/WithdrawScreen";

export const metadata = { title: "Withdraw · Salapi" };

export default async function WithdrawPage({ searchParams }: { searchParams: Promise<{ cur?: string }> }) {
  const { cur } = await searchParams;
  const initialCurrency = ["idr", "php", "usdc"].includes(cur?.toLowerCase() ?? "") ? cur!.toUpperCase() as "IDR" | "PHP" | "USDC" : undefined;
  return <WithdrawScreen initialCurrency={initialCurrency} />;
}
