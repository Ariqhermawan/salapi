import TopUpScreen from "@/components/screens/TopUpScreen";
import type { PaymentChannelId } from "@/lib/payment-channels";

export const metadata = { title: "Add money · Salapi" };

export default async function TopUpPage({ searchParams }: { searchParams: Promise<{ method?: string; channel?: string; via?: string; cur?: string; step?: string; amount?: string }> }) {
  const { method, channel, via, cur, step, amount } = await searchParams;
  const initialMethod = method === "provider" ? "provider" : undefined;
  const validChannel = ["gcash", "qris", "bank-wallet"].includes(channel ?? "") ? channel as PaymentChannelId : undefined;
  const initialCurrency = ["idr", "php", "usdc"].includes(cur?.toLowerCase() ?? "") ? cur!.toUpperCase() as "IDR" | "PHP" | "USDC" : undefined;
  const selectedVia = via ?? channel;
  const initialVia = ["qris", "card", "va"].includes(selectedVia ?? "") ? selectedVia as "qris" | "card" | "va" : undefined;
  const initialStep = step === "pay" ? "pay" : "amount";
  const amountCents = Number(amount);
  const initialAmount = Number.isInteger(amountCents) && amountCents > 0 ? (amountCents / 100).toFixed(2).replace(/\.00$/, "") : undefined;
  return <TopUpScreen key={`${initialMethod ?? "default"}:${validChannel ?? initialVia ?? "default"}:${initialCurrency ?? "choose"}:${initialStep}:${amountCents || ""}`} initialMethod={initialMethod} initialChannel={validChannel} initialCurrency={initialCurrency} initialVia={initialVia} initialStep={initialStep} initialAmount={initialAmount} />;
}
