import { notFound, redirect } from "next/navigation";

const channels: Record<string, string> = { qris: "qris", card: "gcash", va: "bank-wallet" };

export default async function TopUpChannelAliasPage({ params }: { params: Promise<{ method: string; step?: string[] }> }) {
  const { method, step = [] } = await params;
  const channel = channels[method];
  if (!channel || step.length > 1 || step.length === 1 && step[0] !== "pay") notFound();
  const query = new URLSearchParams({ method: "provider", channel, ...(step[0] ? { step: step[0] } : {}) });
  // Provider checkout is not connected in Salapi. The destination shows the
  // existing disconnected provider state rather than inventing a payment.
  redirect(`/topup?${query.toString()}`);
}
