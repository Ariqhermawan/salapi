import { redirect } from "next/navigation";
import TopUpScreen from "@/components/screens/TopUpScreen";
import { isLocalPreview } from "@/lib/local-preview";
import type { PaymentChannelId } from "@/lib/payment-channels";

export const metadata = { title: "Add money · Salapi" };

export default async function TopUpPage({ searchParams }: { searchParams: Promise<{ method?: string; channel?: string; via?: string; cur?: string; step?: string; amount?: string; invalid?: string }> }) {
  const { method, channel, via, cur, step, amount, invalid } = await searchParams;
  const initialMethod = method === "provider" ? "provider" : undefined;
  const validChannel = ["gcash", "qris", "bank-wallet"].includes(channel ?? "") ? channel as PaymentChannelId : undefined;
  const initialCurrency = ["idr", "php", "usdc"].includes(cur?.toLowerCase() ?? "") ? cur!.toUpperCase() as "IDR" | "PHP" | "USDC" : undefined;
  const selectedVia = via ?? channel;
  const initialVia = ["qris", "card", "va"].includes(selectedVia ?? "") ? selectedVia as "qris" | "card" | "va" : undefined;
  const amountCents = typeof amount === "string" && /^\d{1,8}$/.test(amount) ? Number(amount) : NaN;
  const validAmount = Number.isSafeInteger(amountCents) && amountCents >= 100 && amountCents <= 99_999_999;
  const invalidInitialAmount = isLocalPreview && invalid === "amount";
  const supportedLocalFlow = isLocalPreview && initialMethod === "provider" && validChannel && initialVia && (initialCurrency === "IDR" || initialCurrency === "PHP");

  if (supportedLocalFlow && (step === "pay" || amount !== undefined) && !validAmount) {
    const query = new URLSearchParams({ method: "provider", channel: validChannel, via: initialVia, cur: initialCurrency.toLowerCase(), invalid: "amount" });
    redirect(`/topup?${query.toString()}`);
  }

  const initialStep = step === "pay" && validAmount ? "pay" : "amount";
  const initialAmount = invalidInitialAmount ? "" : validAmount ? (amountCents / 100).toFixed(2).replace(/\.00$/, "") : undefined;
  return <TopUpScreen key={`${initialMethod ?? "default"}:${validChannel ?? initialVia ?? "default"}:${initialCurrency ?? "choose"}:${initialStep}:${initialAmount ?? ""}:${invalidInitialAmount ? "invalid" : ""}`} initialMethod={initialMethod} initialChannel={validChannel} initialCurrency={initialCurrency} initialVia={initialVia} initialStep={initialStep} initialAmount={initialAmount} invalidInitialAmount={invalidInitialAmount} />;
}
