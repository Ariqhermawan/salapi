import { notFound, redirect } from "next/navigation";

const channels: Record<string, string> = { qris: "qris", card: "gcash", va: "bank-wallet" };

export default async function TopUpChannelAliasPage({ params, searchParams }: { params: Promise<{ method: string; step?: string[] }>; searchParams: Promise<{ cur?: string; amount?: string }> }) {
  const { method, step = [] } = await params;
  const { cur, amount } = await searchParams;
  const channel = channels[method];
  if (!channel || step.length > 1 || step.length === 1 && step[0] !== "pay") notFound();
  const query = new URLSearchParams({ method: "provider", channel, via: method, ...(cur ? { cur } : {}), ...(step[0] ? { step: step[0] } : {}), ...(amount ? { amount } : {}) });
  // Provider checkout is not connected in Salapi. The destination shows the
  // existing disconnected provider state rather than inventing a payment.
  redirect(`/topup?${query.toString()}`);
}
