export type PaymentChannelId = "gcash" | "qris" | "bank-wallet";
export type PaymentProviderId = "xendit" | "mayar";
export type PaymentNativeCurrency = "tl" | "id";
export type PaymentChannel = {
  id: PaymentChannelId;
  nativeCurrency: PaymentNativeCurrency;
  code: "PHP" | "IDR";
  payin: readonly PaymentProviderId[];
  payout: readonly PaymentProviderId[];
};

/** Disconnected UI catalog, not live account activation or provider capability. */
export const PAYMENT_CHANNELS: readonly PaymentChannel[] = [
  { id: "gcash", nativeCurrency: "tl", code: "PHP", payin: ["xendit"], payout: ["xendit"] },
  { id: "qris", nativeCurrency: "id", code: "IDR", payin: ["xendit", "mayar"], payout: [] },
  { id: "bank-wallet", nativeCurrency: "id", code: "IDR", payin: [], payout: ["xendit"] },
];

export function paymentChannel(id: string): PaymentChannel | undefined {
  return PAYMENT_CHANNELS.find(channel => channel.id === id);
}
export function paymentChannels(payout: boolean): readonly PaymentChannel[] {
  return payout ? PAYMENT_CHANNELS : PAYMENT_CHANNELS.filter(channel => channel.payin.length > 0);
}
export function paymentChannelSupported(id: string, provider: string, payout: boolean): boolean {
  const channel = paymentChannel(id);
  return !!channel && (payout ? channel.payout : channel.payin).some(allowed => allowed === provider);
}
