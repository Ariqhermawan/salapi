import TopUpScreen from "@/components/screens/TopUpScreen";
import type { PaymentChannelId } from "@/lib/payment-channels";

export const metadata = { title: "Add money · Salapi" };

export default async function TopUpPage({ searchParams }: { searchParams: Promise<{ method?: string; channel?: string }> }) {
  const { method, channel } = await searchParams;
  const initialMethod = method === "provider" ? "provider" : undefined;
  const validChannel = ["gcash", "qris", "bank-wallet"].includes(channel ?? "") ? channel as PaymentChannelId : undefined;
  return <TopUpScreen key={`${initialMethod ?? "default"}:${validChannel ?? "default"}`} initialMethod={initialMethod} initialChannel={validChannel} />;
}
